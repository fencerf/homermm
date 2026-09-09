import os
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import hashlib

KEY_FILE = "agent_key.pem"

def get_or_create_keypair():
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, "rb") as key_file:
            private_key = serialization.load_pem_private_key(
                key_file.read(),
                password=None,
            )
    else:
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        with open(KEY_FILE, "wb") as key_file:
            key_file.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))

    public_key = private_key.public_key()
    pub_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )

    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    )

    return priv_pem.decode('utf-8'), pub_pem.decode('utf-8')

def get_fingerprint(pub_pem_str):
    """Generate a short, readable 6-character fingerprint of the public key"""
    import hashlib
    # Clean the PEM string to just the base64 payload
    clean_key = pub_pem_str.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replace("\n", "").strip()
    # Hash the public key and return first 6 chars of hex digest
    return hashlib.sha256(clean_key.encode('utf-8')).hexdigest()[:6].upper()
