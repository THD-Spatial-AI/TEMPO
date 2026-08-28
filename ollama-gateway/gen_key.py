#!/usr/bin/env python3
"""Issue or revoke API keys for the Ollama gateway.

  python3 gen_key.py add "Alice"      -> prints a new key and stores it
  python3 gen_key.py list             -> lists issued keys (name only)
  python3 gen_key.py revoke <key>     -> removes a key

Keys live in ./keys.json (mounted read-only into the container). Restart the
gateway after changing keys:  docker compose restart
"""
import json
import os
import secrets
import sys

PATH = os.environ.get("KEYS_FILE", "keys.json")


def load():
    return json.load(open(PATH)) if os.path.exists(PATH) else {}


def save(keys):
    json.dump(keys, open(PATH, "w"), indent=2)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    keys = load()

    if cmd == "add":
        name = sys.argv[2] if len(sys.argv) > 2 else "user"
        key = "sk-tempo-" + secrets.token_urlsafe(24)
        keys[key] = {"name": name}
        save(keys)
        print(key)
    elif cmd == "revoke":
        key = sys.argv[2]
        if keys.pop(key, None) is not None:
            save(keys)
            print("revoked")
        else:
            print("not found")
    else:  # list
        for k, meta in keys.items():
            print(f"{meta.get('name', '?'):20} {k[:16]}…")


if __name__ == "__main__":
    main()
