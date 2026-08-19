import requests
import psutil
import platform
import socket
import time
import subprocess
import json
import os

SERVER_URL = os.environ.get("SERVER_URL", "http://127.0.0.1:8000")
AGENT_API_KEY = "dummy_agent_key_123"
HEADERS = {"x-agent-key": AGENT_API_KEY}

def get_system_info():
    uname = platform.uname()

    # OS Info
    os_name = platform.system()
    os_version = uname.release

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

    return {
        "hostname": hostname,
        "os_name": os_name,
        "os_version": os_version,
        "cpu_info": cpu_info,
        "memory_total": memory_total,
        "disk_total": disk_total,
        "disk_used": disk_used,
        "kopia_config": kopia_config,
        "ip_address": ip_address
    }

def get_available_updates():
    updates = []
    os_name = platform.system()

    if os_name == "Linux":
        # Assume apt for Debian/Ubuntu
        try:
            # Need to update first usually, but we'll skip for agent simplicity
            # subprocess.run(["sudo", "apt", "update"], capture_output=True)
            result = subprocess.run(["apt", "list", "--upgradable"], capture_output=True, text=True)
            lines = result.stdout.split('\n')[1:] # Skip the "Listing..." line
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
            print(f"Error checking apt updates: {e}")

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
        # Placeholder for real kopia config logic
        # 1. Connect to repo: kopia repository connect server ...
        # 2. Add policy: kopia policy set ...
        paths = payload_data.get("paths", [])
        return "completed", f"Configured Kopia backup for paths: {paths}"

    return "failed", f"Unknown task type: {task_type}"

def main_loop():
    print("Agent starting...")
    machine_id = None

    while True:
        try:
            # 1. Register / Heartbeat
            sys_info = get_system_info()
            resp = requests.post(f"{SERVER_URL}/api/agent/register", json=sys_info, headers=HEADERS)
            resp.raise_for_status()
            machine_data = resp.json()
            machine_id = machine_data["id"]
            print(f"Heartbeat successful. Machine ID: {machine_id}")

            # 2. Check and submit updates
            updates = get_available_updates()
            requests.post(f"{SERVER_URL}/api/agent/{machine_id}/updates", json=updates, headers=HEADERS)

            # 3. Fetch and execute tasks
            resp = requests.get(f"{SERVER_URL}/api/agent/{machine_id}/tasks", headers=HEADERS)
            tasks = resp.json()

            for task in tasks:
                print(f"Executing task: {task['task_type']}")
                status, msg = execute_task(task)
                requests.post(f"{SERVER_URL}/api/agent/{machine_id}/tasks/{task['id']}/result", params={"status": status, "result_message": msg}, headers=HEADERS)

        except requests.exceptions.RequestException as e:
            print(f"Error communicating with server: {e}")
        except Exception as e:
            print(f"Unexpected error: {e}")

        # Poll every 60 seconds (short for testing)
        time.sleep(60)

if __name__ == "__main__":
    # Ensure dependencies are available
    # In a real setup, we would package this with PyInstaller or similar
    main_loop()
