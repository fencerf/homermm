import uvicorn
from app.core.cert_utils import ensure_certs_exist
import os

if __name__ == "__main__":
    cert_dir = os.environ.get("CERT_DIR", "/app/certs")
    ensure_certs_exist(cert_dir)
    cert_path = os.path.join(cert_dir, "cert.pem")
    key_path = os.path.join(cert_dir, "key.pem")

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, ssl_keyfile=key_path, ssl_certfile=cert_path)
