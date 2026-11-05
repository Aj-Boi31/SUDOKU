"""Turn Metered's reply to "create credential" into relay-config.js for the live site.

Used by the deploy workflow. The reply arrives in the RELAY_REPLY environment variable and the
file to write is the first argument. Nothing here prints the password.
"""
import json
import os
import sys

URLS = [
    "turn:global.relay.metered.ca:80",
    "turn:global.relay.metered.ca:80?transport=tcp",
    "turn:global.relay.metered.ca:443",
    "turns:global.relay.metered.ca:443?transport=tcp",
]


def main(out_path):
    try:
        reply = json.loads(os.environ["RELAY_REPLY"])
        username = reply["username"]
        password = reply["password"]
    except (KeyError, TypeError, ValueError):
        print("Metered's reply did not contain a username and password.")
        return 1
    if not username or not password:
        print("Metered's reply had an empty username or password.")
        return 1

    print(f"::add-mask::{password}")   # keep it out of the workflow log
    servers = [{"urls": URLS, "username": username, "credential": password}]
    with open(out_path, "w", encoding="utf-8") as out:
        out.write("window.MP_TURN_SERVERS_LOCAL = " + json.dumps(servers) + ";\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
