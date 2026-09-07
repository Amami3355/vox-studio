"""Fetch only the caller capability, using the crew VM's own identity.

Same REST endpoints as deploy/fetch-service-env.sh. Runs at boot as root in a short-lived
container; no credential crosses the operator terminal or enters instance metadata.
"""
import base64
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen


def read(url, headers):
    with urlopen(Request(url, headers=headers), timeout=30) as response:
        return response.read()


def main():
    metadata = "http://metadata.google.internal/computeMetadata/v1/"
    headers = {"Metadata-Flavor": "Google"}
    project = read(metadata + "project/project-id", headers).decode()
    token = json.loads(read(metadata + "instance/service-accounts/default/token", headers))["access_token"]
    payload = json.loads(read(
        f"https://secretmanager.googleapis.com/v1/projects/{project}/secrets/VOX_NETWORK_TOKEN/versions/latest:access",
        {"Authorization": "Bearer " + token},
    ))
    value = base64.b64decode(payload["payload"]["data"], validate=True).decode()
    if not value or any(character in value for character in "\r\n\x00"):
        raise ValueError("Caller capability cannot be represented as an environment value.")
    os.umask(0o077)
    path = Path("/runtime/network.env")
    temporary = path.with_suffix(".partial")
    with temporary.open("w") as stream:
        stream.write("VOX_NETWORK_TOKEN=" + value + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o600)
    temporary.replace(path)
    print("Crew caller capability installed at mode 0600; no Production private secrets requested.")


if __name__ == "__main__":
    main()
