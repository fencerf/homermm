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
import shutil
import zipfile
import tempfile

# Thread-local storage to track the current action ID
local_data = threading.local()

HAS_COMM_MODULE = False
try:
    import agent_comm
    HAS_COMM_MODULE = True
except ImportError:
    pass

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
                "module": record.module,
                "action_id": getattr(local_data, "action_id", None)
            }
            with log_buffer_lock:
                log_buffer.append(log_entry)
        except Exception:
            self.handleError(record)

AGENT_VERSION = "1.1.6"

def get_kopia_cmd():
    # If the user explicitly provided a path in config.json
    if file_config.get("kopia_path"):
        return file_config.get("kopia_path")

    # Check if 'kopia' is in the system PATH
    if shutil.which("kopia"):
        return "kopia"

    # Check common KopiaUI installation directories on Windows
    if platform.system() == "Windows":
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            # KopiaUI bundles kopia.exe inside its resources directory
            kopia_ui_path = os.path.join(local_app_data, "Programs", "KopiaUI", "resources", "server", "kopia.exe")
            if os.path.exists(kopia_ui_path):
                return kopia_ui_path

    return "kopia" # Fallback to default

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

# Comms configuration
COMM_MODE = file_config.get("comm_mode") or os.environ.get("COMM_MODE", "sse") # Choices: standard, long_polling, sse, amqp
AMQP_URL = file_config.get("amqp_url") or os.environ.get("AMQP_URL", "amqp://guest:guest@localhost/")

LOG_FLUSH_INTERVAL = int(file_config.get("log_flush_interval") or os.environ.get("LOG_FLUSH_INTERVAL", "1800"))

# Package Manager Configuration
# Supported: winget, apt, choco, scoop, yum, brew
default_pm = "winget" if platform.system() == "Windows" else "apt"
PACKAGE_MANAGER = file_config.get("package_manager") or os.environ.get("PACKAGE_MANAGER", default_pm)

PM_COMMANDS = {
    "winget": {
        "list": ["winget", "upgrade"],
        "update_all": ["winget", "upgrade", "--all", "--silent", "--accept-package-agreements", "--accept-source-agreements"],
        "update": ["winget", "upgrade", "--id", "{package}", "--silent", "--accept-package-agreements", "--accept-source-agreements"],
        "install": ["winget", "install", "--id", "{package}", "--silent", "--accept-package-agreements", "--accept-source-agreements"],
        "uninstall": ["winget", "uninstall", "--id", "{package}", "--silent", "--accept-source-agreements"],
    },
    "apt": {
        "list": ["apt", "list", "--upgradable"],
        "update_all": ["sudo", "apt", "upgrade", "-y"],
        "update": ["sudo", "apt", "install", "-y", "{package}"],
        "install": ["sudo", "apt", "install", "-y", "{package}"],
        "uninstall": ["sudo", "apt", "remove", "-y", "{package}"],
    },
    "choco": {
        "list": ["choco", "outdated"],
        "update_all": ["choco", "upgrade", "all", "-y"],
        "update": ["choco", "upgrade", "{package}", "-y"],
        "install": ["choco", "install", "{package}", "-y"],
        "uninstall": ["choco", "uninstall", "{package}", "-y"],
    },
    "scoop": {
        "list": ["scoop", "status"],
        "update_all": ["scoop", "update", "*"],
        "update": ["scoop", "update", "{package}"],
        "install": ["scoop", "install", "{package}"],
        "uninstall": ["scoop", "uninstall", "{package}"],
    },
    "yum": {
        "list": ["yum", "check-update"],
        "update_all": ["sudo", "yum", "update", "-y"],
        "update": ["sudo", "yum", "update", "-y", "{package}"],
        "install": ["sudo", "yum", "install", "-y", "{package}"],
        "uninstall": ["sudo", "yum", "remove", "-y", "{package}"],
    },
    "brew": {
        "list": ["brew", "outdated"],
        "update_all": ["brew", "upgrade"],
        "update": ["brew", "upgrade", "{package}"],
        "install": ["brew", "install", "{package}"],
        "uninstall": ["brew", "uninstall", "{package}"],
    }
}

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

# Event to explicitly trigger a log flush
log_flush_event = threading.Event()

def _flush_logs_now():
    global MACHINE_ID
    if MACHINE_ID is None:
        return

    with log_buffer_lock:
        if not log_buffer:
            return
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

def send_logs_to_server():
    while True:
        # Wait until timeout occurs or event is set explicitly
        log_flush_event.wait(LOG_FLUSH_INTERVAL)
        log_flush_event.clear()
        _flush_logs_now()

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
        kopia_cmd = get_kopia_cmd()
        # Fetch active kopia policies if kopia is installed and connected
        # Since Kopia requires connection context, we will run the list command.
        # In a real environment, it assumes the agent is connected.
        # Fallback to simulated data if kopia CLI is not found or errors (for home deployment tests).
        result = subprocess.run([kopia_cmd, "policy", "list", "--json"], capture_output=True, text=True)
        if result.returncode == 0:
            kopia_config = result.stdout
        else:
             kopia_config = "[]"
    except Exception:
        kopia_config = "[]"

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

    # 1. Check Software Updates via Configured Package Manager
    if PACKAGE_MANAGER in PM_COMMANDS:
        cmd = PM_COMMANDS[PACKAGE_MANAGER]["list"]
        try:
            # Use encoding on Windows to avoid charmap errors
            kwargs = {"capture_output": True, "text": True}
            if os_name == "Windows":
                kwargs["encoding"] = "utf-8"
                kwargs["errors"] = "ignore"

            result = subprocess.run(cmd, **kwargs)

            if PACKAGE_MANAGER == "apt":
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

            elif PACKAGE_MANAGER == "winget":
                lines = result.stdout.split('\n')
                in_table = False
                id_idx = ver_idx = avail_idx = -1

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
                            description = line[0:id_idx].strip()
                            package_id = line[id_idx:ver_idx].strip()
                            current_version = line[ver_idx:avail_idx].strip()
                            available_version = line[avail_idx:].split()[0].strip()
                            if package_id and available_version:
                                updates.append({
                                    "package_name": package_id,
                                    "description": description,
                                    "current_version": current_version,
                                    "new_version": available_version,
                                    "update_type": "software"
                                })
                        else:
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

            elif PACKAGE_MANAGER == "choco":
                lines = result.stdout.split('\n')
                for line in lines:
                    if '|' in line and not line.startswith("Chocolatey"):
                        parts = line.split('|')
                        if len(parts) >= 3:
                            updates.append({
                                "package_name": parts[0].strip(),
                                "current_version": parts[1].strip(),
                                "new_version": parts[2].strip(),
                                "update_type": "software"
                            })

            elif PACKAGE_MANAGER == "scoop":
                lines = result.stdout.split('\n')
                in_table = False
                for line in lines:
                    if line.startswith("---"):
                        in_table = True
                        continue
                    if in_table and len(line.strip()) > 0:
                        parts = line.split()
                        if len(parts) >= 3:
                            updates.append({
                                "package_name": parts[0],
                                "current_version": parts[1],
                                "new_version": parts[2],
                                "update_type": "software"
                            })

            elif PACKAGE_MANAGER == "yum":
                lines = result.stdout.split('\n')
                for line in lines:
                    if len(line.strip()) > 0 and not line.startswith("Loaded plugins") and not line.startswith("Obsoleting Packages"):
                        parts = line.split()
                        if len(parts) >= 3:
                            updates.append({
                                "package_name": parts[0],
                                "new_version": parts[1],
                                "update_type": "software"
                            })

            elif PACKAGE_MANAGER == "brew":
                lines = result.stdout.split('\n')
                for line in lines:
                    parts = line.split()
                    if len(parts) >= 3:
                        updates.append({
                            "package_name": parts[0],
                            "current_version": parts[1],
                            "new_version": parts[2] if parts[2] != "<" else parts[3], # Handles 'current < new' format
                            "update_type": "software"
                        })
        except Exception as e:
            logger.error(f"Error checking {PACKAGE_MANAGER} updates: {e}")

    # 2. Check Windows OS Updates via COM
    if os_name == "Windows":
        try:
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
    # Set the action ID in the thread-local context so any logs emitted correlate to this task
    local_data.action_id = task.get("action_id")

    task_type = task.get("task_type")
    payload = task.get("payload", "{}")
    try:
        payload_data = json.loads(payload)
    except:
        payload_data = {}

    if task_type == "flush_logs":
        logger.info("Received request to flush logs immediately.")
        log_flush_event.set()
        return "completed", "Logs flushed successfully."

    elif task_type == "check_updates":
        logger.info("Received request to check for updates.")
        global MACHINE_ID
        if MACHINE_ID:
            updates = get_available_updates()
            try:
                requests.post(f"{SERVER_URL}/api/agent/{MACHINE_ID}/updates", json=updates, headers=HEADERS)
                return "completed", "Successfully checked and pushed latest updates to server."
            except Exception as e:
                return "failed", f"Failed to push updates: {e}"
        return "failed", "Agent not fully registered yet."

    elif task_type == "update_software":
        package = payload_data.get("package_name")
        if PACKAGE_MANAGER not in PM_COMMANDS:
            return "failed", f"Unsupported package manager: {PACKAGE_MANAGER}"

        if package:
            cmd = [arg.replace("{package}", package) for arg in PM_COMMANDS[PACKAGE_MANAGER]["update"]]
        else:
            cmd = PM_COMMANDS[PACKAGE_MANAGER]["update_all"]

        logger.info(f"Running {PACKAGE_MANAGER} update command: {' '.join(cmd)}")
        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            logger.info(f"{PACKAGE_MANAGER} Output:\n{result.stdout}")
            status, msg = "completed", f"Updated {package or 'all packages'}"
        except subprocess.CalledProcessError as e:
            logger.error(f"{PACKAGE_MANAGER} Update Failed:\n{e.stderr or e.stdout}")
            status, msg = "failed", f"Update failed: {e.stderr or e.stdout}"

        if status == "completed":
            # Refresh updates list
            execute_task({"task_type": "check_updates"})
        return status, msg

    elif task_type == "uninstall_software":
        package = payload_data.get("package_name")
        if not package:
            return "failed", "No package name provided for uninstallation."

        if PACKAGE_MANAGER not in PM_COMMANDS:
            return "failed", f"Unsupported package manager: {PACKAGE_MANAGER}"

        cmd = [arg.replace("{package}", package) for arg in PM_COMMANDS[PACKAGE_MANAGER]["uninstall"]]
        logger.info(f"Running {PACKAGE_MANAGER} uninstall command: {' '.join(cmd)}")
        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            logger.info(f"{PACKAGE_MANAGER} Uninstall Output:\n{result.stdout}")
            status, msg = "completed", f"Uninstalled {package}"
        except subprocess.CalledProcessError as e:
            logger.error(f"{PACKAGE_MANAGER} Uninstall Failed:\n{e.stderr or e.stdout}")
            status, msg = "failed", f"Failed to uninstall {package}: {e.stderr or e.stdout}"

        if status == "completed":
            # Refresh updates list
            execute_task({"task_type": "check_updates"})
        return status, msg

    elif task_type == "install_software":
        package = payload_data.get("package_name")
        if not package:
            return "failed", "No package name provided for installation."

        if PACKAGE_MANAGER not in PM_COMMANDS:
            return "failed", f"Unsupported package manager: {PACKAGE_MANAGER}"

        cmd = [arg.replace("{package}", package) for arg in PM_COMMANDS[PACKAGE_MANAGER]["install"]]
        logger.info(f"Running {PACKAGE_MANAGER} install command: {' '.join(cmd)}")
        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            logger.info(f"{PACKAGE_MANAGER} Install Output:\n{result.stdout}")
            status, msg = "completed", f"Installed {package}"
        except subprocess.CalledProcessError as e:
            logger.error(f"{PACKAGE_MANAGER} Install Failed:\n{e.stderr or e.stdout}")
            status, msg = "failed", f"Failed to install {package}: {e.stderr or e.stdout}"

        if status == "completed":
            # Refresh updates list
            execute_task({"task_type": "check_updates"})
        return status, msg

    elif task_type == "run_kopia_backup":
        try:
            payload_data = json.loads(task['payload'])
        except json.JSONDecodeError:
            return "failed", "Invalid payload json"

        path = payload_data.get("path")
        if not path:
             return "failed", "No path provided to backup."

        kopia_cmd = get_kopia_cmd()
        try:
            logger.info(f"Starting Kopia snapshot for {path}")
            # Run snapshot using standard snapshot command
            subprocess.run([kopia_cmd, "snapshot", "create", path], check=True, capture_output=True, text=True)
            logger.info(f"Successfully completed Kopia snapshot for {path}")
            return "completed", f"Snapshot completed for {path}"
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed taking Kopia snapshot: {e.stderr}")
            return "failed", f"Snapshot failed: {e.stderr}"
        except FileNotFoundError:
            return "failed", "Kopia CLI not found on machine."

    elif task_type == "update_kopia_policy":
        try:
            payload_data = json.loads(task['payload'])
        except json.JSONDecodeError:
            return "failed", "Invalid payload json"

        path = payload_data.get("path")
        retention = payload_data.get("retentionPolicy", {})
        scheduling = payload_data.get("schedulingPolicy", {})
        files = payload_data.get("filesPolicy", {})
        if not path:
             return "failed", "No path provided for policy update."

        kopia_cmd = get_kopia_cmd()
        try:
             logger.info(f"Updating Kopia policy for {path}")
             cmd = [kopia_cmd, "policy", "set", path]

             # Retention
             if "keepHourly" in retention:
                 cmd.extend(["--keep-hourly", str(retention["keepHourly"])])
             if "keepDaily" in retention:
                 cmd.extend(["--keep-daily", str(retention["keepDaily"])])
             if "keepWeekly" in retention:
                 cmd.extend(["--keep-weekly", str(retention["keepWeekly"])])
             if "keepMonthly" in retention:
                 cmd.extend(["--keep-monthly", str(retention["keepMonthly"])])
             if "keepAnnual" in retention:
                 cmd.extend(["--keep-annual", str(retention["keepAnnual"])])

             # Scheduling
             if "intervalSeconds" in scheduling:
                 interval = scheduling["intervalSeconds"]
                 if interval > 0:
                     cmd.extend(["--snapshot-interval", f"{interval}s"])
                 else:
                     # Using 0s disables interval-based scheduling
                     cmd.extend(["--snapshot-interval", "0s"])

             if "timesOfDay" in scheduling:
                 cmd.extend(["--clear-time"])
                 for time_str in scheduling["timesOfDay"]:
                     if time_str:
                         cmd.extend(["--add-time", time_str])

             # Files / Ignore Rules
             if "ignoreRules" in files:
                 cmd.extend(["--clear-ignore"])
                 for rule in files["ignoreRules"]:
                     if rule:
                         cmd.extend(["--add-ignore", rule])

             subprocess.run(cmd, check=True, capture_output=True, text=True)
             logger.info(f"Successfully updated Kopia policy for {path}")
             return "completed", f"Policy updated for {path}"
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed updating Kopia policy: {e.stderr}")
            return "failed", f"Policy update failed: {e.stderr}"
        except FileNotFoundError:
            return "failed", "Kopia CLI not found on machine."

    elif task_type == "read_file":
        try:
            payload_data = json.loads(task['payload'])
        except json.JSONDecodeError:
            return "failed", "Invalid payload json"

        path = payload_data.get("path")
        if not path:
             return "failed", "No path provided for read_file."

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            return "completed", json.dumps({"content": content})
        except FileNotFoundError:
            # For .kopiaignore specifically, if it doesn't exist we can just return empty, but let's be explicit
            return "completed", json.dumps({"content": ""})
        except Exception as e:
            return "failed", f"Failed to read file: {e}"

    elif task_type == "write_file":
        try:
            payload_data = json.loads(task['payload'])
        except json.JSONDecodeError:
            return "failed", "Invalid payload json"

        path = payload_data.get("path")
        content = payload_data.get("content", "")
        if not path:
             return "failed", "No path provided for write_file."

        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            logger.info(f"Successfully wrote to {path}")
            return "completed", f"Saved {path}"
        except Exception as e:
            logger.error(f"Failed to write file {path}: {e}")
            return "failed", f"Failed to write file: {e}"

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

            kopia_cmd = get_kopia_cmd()
            connect_cmd = [
                kopia_cmd, "repository", "connect", "server",
                "--url", kopia_settings.get("kopia_server_url", "https://localhost:51515"),
                "--override-username", "admin",
                "--override-hostname", socket.gethostname(),
                "--password", password
            ]
            if fingerprint:
                connect_cmd.extend(["--server-cert-fingerprint", fingerprint])

            logger.info(f"Connecting to Kopia server with command: {' '.join(connect_cmd[:-1])} --password ***")
            subprocess.run(connect_cmd, check=True, capture_output=True, text=True)

            results = []
            for path in paths:
                try:
                    subprocess.run([kopia_cmd, "policy", "set", path, "--add-include", path], check=True, capture_output=True, text=True)
                    results.append(f"Successfully set Kopia policy for {path}")
                    logger.info(f"Set kopia policy for {path}")
                except subprocess.CalledProcessError as e:
                    results.append(f"Failed setting policy for {path}: {e.stderr}")
                    logger.error(f"Failed setting Kopia policy: {e.stderr}")

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

    elif task_type == "fetch_event_logs":
        try:
            logger.info("Fetching OS event logs (last 5 days, Warnings/Errors)...")
            events = []

            if platform.system() == "Windows":
                # Use Get-WinEvent to fetch System and Application logs, level 2 (Error) and 3 (Warning)
                # Outputting as JSON
                ps_script = """
                $startTime = (Get-Date).AddDays(-5)
                $logs = Get-WinEvent -FilterHashtable @{LogName='System','Application'; Level=2,3; StartTime=$startTime} -MaxEvents 500 -ErrorAction SilentlyContinue | Select-Object TimeCreated, LevelDisplayName, Message, ProviderName, LogName | ConvertTo-Json -Compress -Depth 1
                if ($logs) { Write-Output $logs } else { Write-Output "[]" }
                """
                result = subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, text=True)

                if result.returncode == 0:
                    try:
                        raw_events = json.loads(result.stdout)
                        if isinstance(raw_events, dict): # Sometimes ConvertTo-Json returns a single object instead of array
                            raw_events = [raw_events]

                        for ev in raw_events:
                            # Determine source format as requested (LogName - ProviderName unless duplicate)
                            log_name = ev.get("LogName", "Windows")
                            provider = ev.get("ProviderName", "")

                            if provider and provider != log_name:
                                source_val = f"{log_name} - {provider}"
                            else:
                                source_val = log_name

                            # LevelDisplayName is often "Warning" or "Error"
                            events.append({
                                "timestamp": ev.get("TimeCreated", ""),
                                "level": ev.get("LevelDisplayName", "Warning"),
                                "message": ev.get("Message", ""),
                                "source": source_val
                            })
                    except json.JSONDecodeError:
                        logger.error(f"Failed to parse PowerShell event logs: {result.stdout}")
                else:
                    logger.error(f"Failed to fetch Windows event logs: {result.stderr}")

            else:
                # Linux: use journalctl for priority 3 (err) to 4 (warning)
                try:
                    cmd = ["journalctl", "-p", "3..4", "--since", "5 days ago", "-n", "500", "--output=json"]
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    if result.returncode == 0:
                        lines = result.stdout.strip().split('\n')
                        import datetime as dt_module
                        for line in lines:
                            if not line.strip(): continue
                            try:
                                entry = json.loads(line)
                                # journalctl uses PRIORITY. 3=err, 4=warning
                                prio = str(entry.get("PRIORITY", "4"))
                                level_str = "Error" if prio == "3" else "Warning"

                                # Timestamps are in microseconds since epoch typically
                                ts_micro = int(entry.get("__REALTIME_TIMESTAMP", 0))
                                ts_iso = dt_module.datetime.fromtimestamp(ts_micro / 1000000.0, dt_module.timezone.utc).isoformat()

                                events.append({
                                    "timestamp": ts_iso,
                                    "level": level_str,
                                    "message": entry.get("MESSAGE", ""),
                                    "source": entry.get("SYSLOG_IDENTIFIER", "journal")
                                })
                            except json.JSONDecodeError:
                                pass
                    else:
                        logger.error(f"Failed to fetch Linux event logs: {result.stderr}")
                except FileNotFoundError:
                    logger.warning("journalctl not found on this system.")

            return "completed", json.dumps({"events": events})
        except Exception as e:
            logger.error(f"Unexpected error fetching event logs: {e}")
            return "failed", str(e)

    elif task_type == "update_agent":
        logger.info("Received update_agent task. Downloading new script...")

        # Save the current action_id locally so the new thread can copy it
        current_action_id = local_data.action_id

        def do_update():
            local_data.action_id = current_action_id # Propagate context to new thread
            try:
                # 1. Download the zip file
                resp = requests.get(f"{SERVER_URL}/api/agent/download?format=zip", headers=HEADERS, stream=True)
                resp.raise_for_status()

                tmp_dir = tempfile.mkdtemp()
                zip_path = os.path.join(tmp_dir, "agent.zip")

                with open(zip_path, 'wb') as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)

                # 2. Extract the zip file
                extract_dir = os.path.join(tmp_dir, "extracted")
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(extract_dir)

                # 3. Copy contents to agent directory
                agent_dir = os.path.dirname(os.path.abspath(__file__))
                for item in os.listdir(extract_dir):
                    s = os.path.join(extract_dir, item)
                    d = os.path.join(agent_dir, item)
                    if os.path.isdir(s):
                        if os.path.exists(d):
                            shutil.rmtree(d)
                        shutil.copytree(s, d)
                    else:
                        shutil.copy2(s, d)

                # 4. Install requirements if present
                req_path = os.path.join(agent_dir, "requirements.txt")
                if os.path.exists(req_path):
                    logger.info("Installing requirements...")
                    subprocess.run([sys.executable, "-m", "pip", "install", "-r", req_path], check=True, capture_output=True)

                shutil.rmtree(tmp_dir)

                logger.info("Agent updated successfully. Restarting process...")
                time.sleep(1) # Allow result to be sent back

                if platform.system() == "Windows":
                    # On Windows, if we are running as a service, os.execv will detach from SCM and the service will crash/stop.
                    # Exiting cleanly will allow the Windows Service Recovery (if configured) to restart the agent natively.
                    logger.info("Windows detected. Exiting to allow Service Recovery to restart agent.")
                    os._exit(0)
                else:
                    # Exec replaces the current process natively on Unix
                    os.execv(sys.executable, [sys.executable, os.path.abspath(__file__)] + sys.argv[1:])
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

def heartbeat_loop():
    """Background thread to periodically send registration/heartbeats"""
    global MACHINE_ID
    while True:
        try:
            sys_info = get_system_info()
            resp = requests.post(f"{SERVER_URL}/api/agent/register", json=sys_info, headers=HEADERS)
            resp.raise_for_status()
            machine_data = resp.json()
            MACHINE_ID = machine_data["id"]
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
        # Send heartbeat every 60 seconds
        time.sleep(60)

def main_loop():
    global MACHINE_ID

    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGINT, handle_exit_signal)
        signal.signal(signal.SIGTERM, handle_exit_signal)

    logger.info(f"Agent starting... Connecting to {SERVER_URL}")

    # 1. Initial Registration
    while MACHINE_ID is None:
        try:
            sys_info = get_system_info()
            resp = requests.post(f"{SERVER_URL}/api/agent/register", json=sys_info, headers=HEADERS)
            resp.raise_for_status()
            machine_data = resp.json()
            MACHINE_ID = machine_data["id"]
        except Exception as e:
            logger.error(f"Initial registration failed: {e}. Retrying in 5 seconds...")
            time.sleep(5)

    # Start heartbeat in background
    threading.Thread(target=heartbeat_loop, daemon=True).start()

    if not HAS_COMM_MODULE:
        logger.warning("agent_comm module not found. This agent is running in legacy fallback mode.")
        logger.info("Triggering automatic self-update to download complete package...")
        # Synthesize an update task to trigger the zip download and extraction
        execute_task({"task_type": "update_agent"})
        # The update task runs in a background thread, so we'll just sleep and wait for the restart
        while True:
            time.sleep(1)

    logger.info(f"Registered as Machine ID: {MACHINE_ID}. Starting {COMM_MODE} listener...")

    # 2. Start Listener
    listener = None
    if COMM_MODE == "standard":
        listener = agent_comm.StandardPollingListener(SERVER_URL, HEADERS, MACHINE_ID, execute_task)
    elif COMM_MODE == "long_polling":
        listener = agent_comm.LongPollingListener(SERVER_URL, HEADERS, MACHINE_ID, execute_task)
    elif COMM_MODE == "sse":
        listener = agent_comm.SSEListener(SERVER_URL, HEADERS, MACHINE_ID, execute_task)
    elif COMM_MODE == "amqp":
        listener = agent_comm.AMQPListener(AMQP_URL, SERVER_URL, HEADERS, MACHINE_ID, execute_task)
    else:
        logger.error(f"Unknown COMM_MODE: {COMM_MODE}. Falling back to standard polling.")
        listener = agent_comm.StandardPollingListener(SERVER_URL, HEADERS, MACHINE_ID, execute_task)

    try:
        listener.start()
    except KeyboardInterrupt:
        logger.info("Interrupt received, stopping listener...")
        listener.stop()

# Windows Service Class Definition
# This must be defined at the module level so the Service Control Manager can import it
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
    except ImportError:
        HCMSAgentService = None

if __name__ == "__main__":
    if platform.system() == "Windows":
        if HCMSAgentService is not None:
            if len(sys.argv) > 1 and sys.argv[1] in ['install', 'update', 'remove', 'start', 'stop', 'restart']:
                win32serviceutil.HandleCommandLine(HCMSAgentService)
            else:
                # If no service commands passed, run normally
                main_loop()
        else:
            logger.warning("pywin32 is not installed. Windows Service functionality disabled. Run 'pip install pywin32'.")
            main_loop()
    else:
        main_loop()
