#!/usr/bin/env python3
"""Generate a salted PBKDF2-SHA256 hash for the admin password.

Usage:
    python set_password.py                 # prompts securely (no echo)
    python set_password.py 'YourPassword'  # or pass it as an argument

Copy the printed line into the ADMIN_PASSWORD_HASH environment variable.
"""
import sys, getpass, hashlib, secrets

def hash_password(password, iterations=200000):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256${}${}${}".format(iterations, salt.hex(), dk.hex())

def main():
    if len(sys.argv) > 1:
        pw = sys.argv[1]
    else:
        pw = getpass.getpass("New admin password: ")
        if pw != getpass.getpass("Confirm password: "):
            print("Passwords do not match.", file=sys.stderr); sys.exit(1)
    if not pw:
        print("Password cannot be empty.", file=sys.stderr); sys.exit(1)
    print(hash_password(pw))

if __name__ == "__main__":
    main()
