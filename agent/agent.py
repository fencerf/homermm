import requests
import psutil
import platform
import socket
import time
import subprocess
import json
import os
import argparse
import logging
import threading
from datetime import datetime
import websocket
import signal
import sys

# Logging setup
log_buffer = []
log_buffer_lock = threading.Lock()

class BufferedServerLogHandler(logging.Handler):
    def emit(self, record):
        try:
            log_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "level": record.levelname,
                "message": self.format(record),
                "module": record.module
            }
            with log_buffer_lock:
                log_buffer.append(log_entry)
        except Exception:
            self.handleError(record)

AGENT_VERSION = "1.1.0"

# Load optional config.json
config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
file_config = {}
if os.path.exists(config_path):
    try:
        with open(config_path, "r") as f:
            file_config = json.load(f)
    except Exception as e:
        print(f"Failed to load config.json: {e}")

# Parse command line arguments (using parse_known_args to not crash on win32 service arguments)
parser = argparse.ArgumentParser(description="HCMS Client Agent")
parser.add_argument("-s", "--server", type=str, help="Address of the HCMS server (e.g. http://192.168.1.100:8000)")
parser.add_argument("--log-level", type=str, help="Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)")
parser.add_argument("--log-file", type=str, help="Path to log file")
args, unknown_args = parser.parse_known_args()

# Configuration hierarchy: Args > Config File > Environment > Default
SERVER_URL = args.server or file_config.get("server") or os.environ.get("SERVER_URL", "http://127.0.0.1:8000")
AGENT_API_KEY = file_config.get("api_key") or os.environ.get("AGENT_API_KEY", "dummy_agent_key_123")
HEADERS = {"x-agent-key": AGENT_API_KEY}
MACHINE_ID = None

# Configure Logging
log_level_str = args.log_level or file_config.get("log_level") or os.environ.get("LOG_LEVEL", "INFO")
log_file_str = args.log_file or file_config.get("log_file") or os.environ.get("LOG_FILE")

log_level_num = getattr(logging, log_level_str.upper(), logging.INFO)
handlers = [logging.StreamHandler(), BufferedServerLogHandler()]
if log_file_str:
    handlers.append(logging.FileHandler(log_file_str))

logging.basicConfig(
    level=log_level_num,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=handlers
)
logger = logging.getLogger("hcms_agent")

def send_logs_to_server():
    global MACHINE_ID
    while True:
        time.sleep(10)
        if MACHINE_ID is None:
            continue

        with log_buffer_lock:
            if not log_buffer:
                continue
            batch = log_buffer[:]
            log_buffer.clear()

        try:
            response = requests.post(
                f"{SERVER_URL}/api/agent/{MACHINE_ID}/logs",
                json={"logs": batch},
                headers=HEADERS,
                timeout=5
            )
            if response.status_code != 200:
                # If failed, push back to buffer
                with log_buffer_lock:
                    log_buffer.extend(batch)
        except Exception as e:
            # If failed, push back to buffer
            with log_buffer_lock:
                log_buffer.extend(batch)

# Start logging thread
threading.Thread(target=send_logs_to_server, daemon=True).start()

def get_system_info():
    uname = platform.uname()

    # OS Info
    os_name = platform.system()
    os_version = uname.release

    # Attempt to get patch level / build number
    if os_name == "Windows":
        try:
            # Get specific build number on Windows
            os_version = f"{uname.release} (Build {uname.version})"
        except:
            pass
    elif os_name == "Linux":
        try:
             with open("/etc/os-release") as f:
                 for line in f:
                     if line.startswith("PRETTY_NAME="):
                         os_version = line.split("=")[1].strip().strip('"')
                         break
        except:
             pass

    # CPU
    cpu_info = f"{uname.processor} ({psutil.cpu_count(logical=False)} Cores)"

    # Memory
    svmem = psutil.virtual_memory()
    memory_total = int(svmem.total / (1024 ** 2)) # MB

    # Disk
    disk_total = 0
    disk_used = 0
    try:
        if os_name == "Windows":
            disk_usage = psutil.disk_usage('C:\\')
        else:
            disk_usage = psutil.disk_usage('/')
        disk_total = int(disk_usage.total / (1024 ** 3)) # GB
        disk_used = int(disk_usage.used / (1024 ** 3)) # GB
    except Exception:
        pass

    # Kopia Policies
    kopia_config = None
    try:
        # Fetch active kopia policies if kopia is installed and connected
        result = subprocess.run(["kopia", "policy", "list", "--json"], capture_output=True, text=True)
        if result.returncode == 0:
            kopia_config = result.stdout
    except Exception:
        pass

    # Network
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)

    network_info = []
    try:
        net_if_addrs = psutil.net_if_addrs()
        for interface_name, interface_addresses in net_if_addrs.items():
            for address in interface_addresses:
                if str(address.family) == 'AddressFamily.AF_INET':
                    network_info.append({
                        "interface": interface_name,
                        "ip": address.address,
                        "netmask": address.netmask
                    })
    except Exception as e:
        logger.warning(f"Failed to get detailed network info: {e}")

    return {
        "hostname": hostname,
        "os_name": os_name,
        "os_version": os_version,
        "cpu_info": cpu_info,
        "memory_total": memory_total,
        "disk_total": disk_total,
        "disk_used": disk_used,
        "kopia_config": kopia_config,
        "ip_address": ip_address,
        "network_info": json.dumps(network_info) if network_info else None,
        "agent_version": AGENT_VERSION
    }

def get_available_updates():
    updates = []
    os_name = platform.system()

    if os_name == "Linux":
        # Assume apt for Debian/Ubuntu
        try:
            result = subprocess.run(["apt", "list", "--upgradable"], capture_output=True, text=True)
            lines = result.stdout.split('\n')[1:]
            for line in lines:
                if '/' in line:
                    parts = line.split()
                    package_name = parts[0].split('/')[0]
                    new_version = parts[1]
                    updates.append({
                        "package_name": package_name,
                        "new_version": new_version,
                        "update_type": "software"
                    })
        except Exception as e:
            logger.error(f"Error checking apt updates: {e}")

    elif os_name == "Windows":
        # 1. Check Winget (Software Updates)
        try:
            # Setting encoding parameter to avoid decoding errors on windows
            result = subprocess.run(["winget", "upgrade"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
            lines = result.stdout.split('\n')

            # Look for the start of the table and determine column positions
            in_table = False
            id_idx = -1
            ver_idx = -1
            avail_idx = -1

            for line in lines:
                if not in_table and line.startswith("Name") and "Id" in line and "Version" in line and "Available" in line:
                    in_table = True
                    id_idx = line.find("Id")
                    ver_idx = line.find("Version")
                    avail_idx = line.find("Available")
                    continue

                if in_table and line.startswith("-"):
                    continue

                if in_table and len(line.strip()) > 5:
                    if id_idx != -1 and ver_idx != -1 and avail_idx != -1:
                        # Parse using fixed-width indices
                        description = line[0:id_idx].strip()
                        package_id = line[id_idx:ver_idx].strip()
                        current_version = line[ver_idx:avail_idx].strip()
                        available_version = line[avail_idx:].split()[0].strip() # Take the first token after 'Available' column starts
                        if package_id and available_version:
                            updates.append({
                                "package_name": package_id,
                                "description": description,
                                "current_version": current_version,
                                "new_version": available_version,
                                "update_type": "software"
                            })
                    else:
                        # Fallback parsing if headers weren't found perfectly
                        import re
                        parts = re.split(r'\s{2,}', line.strip())
                        if len(parts) >= 3:
                            updates.append({
                                "package_name": parts[1] if len(parts) > 3 else parts[0],
                                "description": parts[0],
                                "current_version": parts[2] if len(parts) > 4 else None,
                                "new_version": parts[-2] if len(parts) > 3 else parts[-1],
                                "update_type": "software"
                            })
        except Exception:
            pass

        # 2. Check Windows OS Updates via COM
        try:
            # We will invoke PowerShell to query Microsoft.Update.Session
            ps_script = """
            $UpdateSession = New-Object -ComObject Microsoft.Update.Session
            $UpdateSearcher = $UpdateSession.CreateUpdateSearcher()
            $SearchResult = $UpdateSearcher.Search("IsInstalled=0 and Type='Software'")
            foreach ($update in $SearchResult.Updates) {
                Write-Output $update.Title
            }
            """
            result = subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, text=True)
            if result.returncode == 0:
                os_lines = [line.strip() for line in result.stdout.split('\n') if line.strip()]
                for title in os_lines:
                    updates.append({
                        "package_name": title,
                        "new_version": "Pending",
                        "update_type": "os"
                    })
        except Exception:
            pass

    return updates

def execute_task(task):
    task_type = task.get("task_type")
    payload = task.get("payload", "{}")
    try:
        payload_data = json.loads(payload)
    except:
        payload_data = {}

    if task_type == "update_software":
        package = payload_data.get("package_name")
        os_name = platform.system()

        if os_name == "Linux":
            if package:
                cmd = ["sudo", "apt", "install", "-y", package]
            else:
                cmd = ["sudo", "apt", "upgrade", "-y"]
            subprocess.run(cmd, check=True)
            return "completed", f"Updated {package or 'all packages'}"

        elif os_name == "Windows":
            if package:
                cmd = ["winget", "upgrade", "--id", package, "--silent", "--accept-package-agreements", "--accept-source-agreements"]
            else:
                cmd = ["winget", "upgrade", "--all", "--silent", "--accept-package-agreements", "--accept-source-agreements"]
            subprocess.run(cmd, check=True)
            return "completed", f"Updated {package or 'all packages'}"

    elif task_type == "install_software":
        package = payload_data.get("package_name")
        if not package:
            return "failed", "No package name provided for installation."

        os_name = platform.system()
        if os_name == "Windows":
            cmd = ["winget", "install", "--id", package, "--silent", "--accept-package-agreements", "--accept-source-agreements"]
            try:
                subprocess.run(cmd, check=True)
                return "completed", f"Installed {package}"
            except Exception as e:
                return "failed", f"Failed to install {package}: {str(e)}"
        else:
            return "failed", "Software installation via agent is currently only supported on Windows using winget."

    elif task_type == "configure_kopia":
        try:
            payload_data = json.loads(task['payload'])
        except json.JSONDecodeError:
            return "failed", "Invalid payload json"

        paths = payload_data.get("paths", [])
        kopia_settings = payload_data.get("kopia_settings", {})

        if not paths:
            return "failed", "No paths provided for Kopia backup."
        if not kopia_settings:
             return "failed", "No Kopia server settings found."

        try:
            password = kopia_settings.get("kopia_repo_password")
            if not password:
                return "failed", "No Kopia repository password provided."

            fingerprint = kopia_settings.get("kopia_server_cert_fingerprint", "")

            connect_cmd = [
                "kopia", "repository", "connect", "server",
                "--url", kopia_settings.get("kopia_server_url", "https://localhost:51515"),
                "--override-username", "admin",
                "--override-hostname", socket.gethostname(),
                "--password", password
            ]
            if fingerprint:
                connect_cmd.extend(["--server-cert-fingerprint", fingerprint])

            subprocess.run(connect_cmd, check=True, capture_output=True, text=True)

            results = []
            for path in paths:
                try:
                    subprocess.run(["kopia", "policy", "set", path, "--add-include", path], check=True, capture_output=True, text=True)
                    results.append(f"Successfully set Kopia policy for {path}")
                except subprocess.CalledProcessError as e:
                    results.append(f"Failed setting policy for {path}: {e.stderr}")

            return "completed", "; ".join(results)
        except subprocess.CalledProcessError as e:
            return "failed", f"Failed to connect to Kopia server: {e.stderr}"
        except FileNotFoundError:
             return "failed", "Kopia CLI not found on machine."

    elif task_type == "list_directory":
        path = payload_data.get("path")
        os_name = platform.system()
        items = []

        try:
            # Handle Windows root listing (drives)
            if not path and os_name == "Windows":
                for part in psutil.disk_partitions():
                    items.append({
                        "name": part.mountpoint,
                        "path": part.mountpoint,
                        "is_dir": True
                    })
            else:
                if not path:
                    path = "/" # Default Linux root

                with os.scandir(path) as it:
                    for entry in it:
                        items.append({
                            "name": entry.name,
                            "path": entry.path,
                            "is_dir": entry.is_dir()
                        })
                # Sort: directories first, then files, alphabetically
                items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

            return "completed", json.dumps({"current_path": path, "items": items})
        except Exception as e:
            return "failed", str(e)

    elif task_type == "start_filebrowser_ws":
        # Launching websocket connection in a separate thread if one is not already running
        global WS_THREAD_ACTIVE
        if not globals().get('WS_THREAD_ACTIVE'):
             globals()['WS_THREAD_ACTIVE'] = True
             threading.Thread(target=interactive_filebrowser_ws, daemon=True).start()
             return "completed", "WebSocket filebrowser connection established"
        return "completed", "WebSocket filebrowser connection already active"

    elif task_type == "update_agent":
        logger.info("Received update_agent task. Downloading new script...")

        def do_update():
            try:
                resp = requests.get(f"{SERVER_URL}/api/agent/download", headers=HEADERS)
                resp.raise_for_status()

                # Write to self
                script_path = os.path.abspath(__file__)
                with open(script_path, "w") as f:
                    f.write(resp.text)

                logger.info("Agent script updated successfully. Restarting process...")
                time.sleep(1) # Allow result to be sent back

                if platform.system() == "Windows":
                    # On Windows, if we are running as a service, os.execv will detach from SCM and the service will crash/stop.
                    # Exiting cleanly will allow the Windows Service Recovery (if configured) to restart the agent natively.
                    logger.info("Windows detected. Exiting to allow Service Recovery to restart agent.")
                    os._exit(0)
                else:
                    # Exec replaces the current process natively on Unix
                    os.execv(sys.executable, [sys.executable, script_path] + sys.argv[1:])
            except Exception as e:
                logger.error(f"Failed to update agent: {e}")

        threading.Thread(target=do_update, daemon=True).start()
        return "completed", "Agent is downloading update and restarting."

    return "failed", f"Unknown task type: {task_type}"

def interactive_filebrowser_ws():
    global MACHINE_ID
    if MACHINE_ID is None:
        logger.error("Cannot start WebSocket, no MACHINE_ID")
        return

    ws_url = SERVER_URL.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/api/agent/{MACHINE_ID}/ws?token={AGENT_API_KEY}"

    def on_message(ws, message):
        try:
            req = json.loads(message)
            if req.get("type") == "list_directory":
                path = req.get("path", "")

                items = []
                os_name = platform.system()
                if os_name == "Windows" and not path:
                    partitions = psutil.disk_partitions()
                    for partition in partitions:
                        items.append({
                            "name": partition.device,
                            "path": partition.device,
                            "is_dir": True
                        })
                    ws.send(json.dumps({"type": "directory_result", "current_path": path, "items": items, "req_id": req.get("req_id")}))
                else:
                    if not path:
                        path = "/"
                    try:
                        with os.scandir(path) as entries:
                            for entry in entries:
                                items.append({
                                    "name": entry.name,
                                    "path": entry.path,
                                    "is_dir": entry.is_dir()
                                })
                        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
                        ws.send(json.dumps({"type": "directory_result", "current_path": path, "items": items, "req_id": req.get("req_id")}))
                    except Exception as e:
                         ws.send(json.dumps({"type": "directory_error", "error": str(e), "req_id": req.get("req_id")}))
        except Exception as e:
            logger.error(f"Error in ws on_message: {e}")

    def on_error(ws, error):
        logger.error(f"WebSocket file browser error: {error}")

    def on_close(ws, close_status_code, close_msg):
        logger.info("WebSocket file browser closed")
        globals()['WS_THREAD_ACTIVE'] = False

    def on_open(ws):
        logger.info("WebSocket file browser connected")

    # Disable websocket trace
    websocket.enableTrace(False)
    ws = websocket.WebSocketApp(ws_url,
                              on_open=on_open,
                              on_message=on_message,
                              on_error=on_error,
                              on_close=on_close)

    ws.run_forever()

def handle_exit_signal(signum, frame):
    logger.info(f"Received signal {signum}. Gracefully shutting down...")
    sys.exit(0)

def main_loop():
    global MACHINE_ID

    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGINT, handle_exit_signal)
        signal.signal(signal.SIGTERM, handle_exit_signal)

    logger.info(f"Agent starting... Connecting to {SERVER_URL}")

    while True:
        try:
            # 1. Register / Heartbeat
            sys_info = get_system_info()
            resp = requests.post(f"{SERVER_URL}/api/agent/register", json=sys_info, headers=HEADERS)
            resp.raise_for_status()
            machine_data = resp.json()
            MACHINE_ID = machine_data["id"]

            # 2. Check and submit updates
            updates = get_available_updates()
            requests.post(f"{SERVER_URL}/api/agent/{MACHINE_ID}/updates", json=updates, headers=HEADERS)

            # 3. Fetch and execute tasks
            resp = requests.get(f"{SERVER_URL}/api/agent/{MACHINE_ID}/tasks", headers=HEADERS)
            tasks = resp.json()

            for task in tasks:
                logger.info(f"Executing task: {task['task_type']}")
                status, msg = execute_task(task)
                requests.post(f"{SERVER_URL}/api/agent/{MACHINE_ID}/tasks/{task['id']}/result", params={"status": status, "result_message": msg}, headers=HEADERS)

        except requests.exceptions.RequestException as e:
            logger.error(f"Error communicating with server: {e}")
        except Exception as e:
            logger.error(f"Unexpected error: {e}")

        # Fast polling interval for interactive features
        time.sleep(5)

if __name__ == "__main__":
    if platform.system() == "Windows":
        try:
            import win32serviceutil
            import win32service
            import win32event
            import servicemanager

            class HCMSAgentService(win32serviceutil.ServiceFramework):
                _svc_name_ = "HCMSAgent"
                _svc_display_name_ = "HCMS Client Agent"
                _svc_description_ = "Home Computer Management System background agent"

                def __init__(self, args):
                    win32serviceutil.ServiceFramework.__init__(self, args)
                    self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
                    socket.setdefaulttimeout(60)

                def SvcStop(self):
                    self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
                    logger.info("Service stopping...")
                    win32event.SetEvent(self.hWaitStop)

                def SvcDoRun(self):
                    servicemanager.LogMsg(
                        servicemanager.EVENTLOG_INFORMATION_TYPE,
                        servicemanager.PYS_SERVICE_STARTED,
                        (self._svc_name_, '')
                    )
                    logger.info("Service started")
                    # Start the main loop in a separate thread so we can respond to SvcStop
                    t = threading.Thread(target=main_loop, daemon=True)
                    t.start()
                    # Wait for stop signal
                    win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)

            if len(sys.argv) > 1 and sys.argv[1] in ['install', 'update', 'remove', 'start', 'stop', 'restart']:
                win32serviceutil.HandleCommandLine(HCMSAgentService)
            else:
                # If no service commands passed, run normally
                main_loop()
        except ImportError:
            logger.warning("pywin32 is not installed. Windows Service functionality disabled. Run 'pip install pywin32'.")
            main_loop()
    else:
        main_loop()
