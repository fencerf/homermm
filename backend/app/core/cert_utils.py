import os
import subprocess

def ensure_certs_exist(cert_dir="/app/certs"):
    os.makedirs(cert_dir, exist_ok=True)
    cert_path = os.path.join(cert_dir, "cert.pem")
    key_path = os.path.join(cert_dir, "key.pem")

    if not os.path.exists(cert_path) or not os.path.exists(key_path):
        print(f"Generating self-signed certificate in {cert_dir}...")
        try:
            subprocess.run([
                "openssl", "req", "-x509", "-newkey", "rsa:4096",
                "-keyout", key_path, "-out", cert_path,
                "-days", "365", "-nodes", "-subj", "/CN=hcms"
            ], check=True)
            print("Self-signed certificate generated successfully.")
        except Exception as e:
            print(f"Failed to generate self-signed certificate: {e}")
