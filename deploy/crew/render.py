"""Render secret-free, digest-pinned COS boot configuration for the isolated crew.

Run with --help. Production output preserves deploy/cloud-init.yaml and adds only the
restricted forwarding account. Public keys are obtained through the operator's existing IAP SSH.
"""
import argparse
import base64
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent


def image_ref(value):
    if not re.fullmatch(r"europe-west1-docker\.pkg\.dev/[a-z0-9-]+/(?:vox|vox-crew)/[a-z-]+@sha256:[0-9a-f]{64}", value):
        raise ValueError("Use an immutable image digest in the Vox registry.")
    return value


def file(path, content, mode="0644"):
    return {"path": path, "owner": "root:root", "permissions": mode,
            "encoding": "b64", "content": base64.b64encode(content.encode()).decode()}


def crew(image, production_ip, host_key, run_id, *, live=False):
    image_ref(image)
    if "/vox-crew/crew@" not in image:
        raise ValueError("The crew needs a separate registry repository with no Production images.")
    if not re.fullmatch(r"10\.\d+\.\d+\.\d+", production_ip):
        raise ValueError("Production must have a private address.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", run_id):
        raise ValueError("The probe requires an existing Run identifier.")
    if not re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\n]*)?", host_key.strip()):
        raise ValueError("Pin Production's ed25519 host public key read through operator SSH.")
    disk = "/mnt/disks/vox-crew"
    mount_unit = r"mnt-disks-vox\x2dcrew.mount"
    setup = f"""#!/bin/bash
set -euo pipefail
findmnt -rn -S /dev/disk/by-id/google-vox-crew-state -T {disk} >/dev/null
install -d -m 0700 {disk}/bridge
install -d -m 0700 -o 10001 -g 10001 {disk}/state
chmod 0755 /etc/vox-crew
if [[ ! -f {disk}/bridge/id_ed25519 ]]; then
  ssh-keygen -q -t ed25519 -N '' -f {disk}/bridge/id_ed25519
fi
chmod 0600 {disk}/bridge/id_ed25519
HOME=/home/vox docker-credential-gcr configure-docker --registries=europe-west1-docker.pkg.dev
HOME=/home/vox docker pull {image}
docker run --rm --user 0 --network host --entrypoint python \\
  --mount type=bind,src=/etc/vox-crew,dst=/runtime {image} /runtime/fetch-env.py
"""
    prepare = """#!/bin/bash
set -euo pipefail
device=/dev/disk/by-id/google-vox-crew-state
test -b "$device"
kind=$(blkid -p -s TYPE -o value "$device" || true)
if [[ "$kind" == ext4 ]]; then exit 0; fi
if [[ -n "$kind" || -n "$(wipefs --no-act --noheadings "$device")" ]]; then
  echo 'Refusing to format a crew disk that already has a signature.' >&2
  exit 1
fi
mkfs.ext4 -L vox-crew-state "$device"
"""
    prepare_unit = """[Unit]
Description=Initialize only the named blank crew state disk
After=systemd-udev-settle.service
Wants=systemd-udev-settle.service
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash /etc/vox-crew/prepare-disk.sh
"""
    mount = f"""[Unit]
Description=Vox crew persistent state
Requires=vox-crew-disk.service
After=vox-crew-disk.service
[Mount]
What=/dev/disk/by-id/google-vox-crew-state
Where={disk}
Type=ext4
Options=defaults
[Install]
WantedBy=multi-user.target
"""
    setup_unit = f"""[Unit]
Description=Prepare isolated crew runtime
Requires={mount_unit}
After=network-online.target gcr-online.target {mount_unit}
Wants=network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash /etc/vox-crew/setup.sh
[Install]
WantedBy=multi-user.target
"""
    bridge = f"""[Unit]
Description=Restricted cloud-to-cloud Production forwarding
Requires=vox-crew-setup.service
After=vox-crew-setup.service network-online.target
[Service]
ExecStart=/usr/bin/ssh -NT -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/etc/vox-crew/known_hosts -o IdentitiesOnly=yes -o ExitOnForwardFailure=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -i {disk}/bridge/id_ed25519 -L 127.0.0.1:18080:127.0.0.1:8080 voxbridge@{production_ip}
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
"""
    common = f"""--rm --network host --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,nosuid,nodev,size=128m --env-file /etc/vox-crew/network.env --env GOOGLE_GENAI_USE_VERTEXAI=true --env GOOGLE_CLOUD_PROJECT=studio-prod-7f3a --env GOOGLE_CLOUD_LOCATION=europe-west1 --mount type=bind,src={disk}/state,dst=/var/lib/vox-crew --mount type=bind,src=/etc/vox-crew,dst=/etc/vox-crew,readonly {image}"""
    probe_unit = f"""[Unit]
Description=Signed Production contract and status proof
Requires=vox-crew-setup.service vox-crew-bridge.service
After=vox-crew-setup.service vox-crew-bridge.service
[Service]
Type=oneshot
ExecStart=/usr/bin/docker run {common} probe --run-id {run_id}
TimeoutStartSec=180
"""
    live_environment = ""
    prepare_live = ""
    if live:
        live_environment = "--env-file /etc/vox-crew/parallel.env --env GOOGLE_CLOUD_LOCATION=global --env VOX_CREW_MODEL=gemini-3.5-flash --env VOX_RESEARCH_MODEL=gemini-3.5-flash "
        prepare_live = f"ExecStartPre=/usr/bin/docker run --rm --user 0 --network host --entrypoint python --mount type=bind,src=/etc/vox-crew,dst=/runtime {image} /runtime/fetch-env.py --parallel\n"
    attempt_common = common.replace("--rm ", "--rm --name vox-crew-attempt " + live_environment, 1)
    # The last Docker --env value wins; replace the shared regional location explicitly.
    if live:
        attempt_common = attempt_common.replace("--env GOOGLE_CLOUD_LOCATION=europe-west1", "--env GOOGLE_CLOUD_LOCATION=global")
    attempt = f"""[Unit]
Description=Explicit Vox crew attempt (no automatic paid retry)
Requires=vox-crew-setup.service vox-crew-bridge.service
After=vox-crew-setup.service vox-crew-bridge.service
[Service]
Type=oneshot
{prepare_live}ExecStart=/usr/bin/docker run {attempt_common} run --request /var/lib/vox-crew/request.json
TimeoutStartSec=infinity
Restart=no
"""
    files = [
        file("/etc/vox-crew/prepare-disk.sh", prepare, "0700"),
        file("/etc/vox-crew/setup.sh", setup, "0700"),
        file("/etc/vox-crew/fetch-env.py", (HERE / "fetch-env.py").read_text()),
        file("/etc/vox-crew/operator-policy.json", (HERE / "operator-policy.json").read_text(), "0444"),
        file("/etc/vox-crew/known_hosts", production_ip + " " + " ".join(host_key.split()[:2]) + "\n"),
    ]
    if live:
        for name in ("operator-policy.json", "execution-limits.json"):
            files = [entry for entry in files if entry["path"] != "/etc/vox-crew/" + name]
            files.append(file("/etc/vox-crew/" + name, (HERE / "milestone-2" / name).read_text(), "0444"))
        files.append(file("/etc/vox-crew/milestone-2-request.json", (HERE / "milestone-2/request.json").read_text(), "0444"))
    for name, content in (("vox-crew-disk.service", prepare_unit), (mount_unit, mount), ("vox-crew-setup.service", setup_unit),
                          ("vox-crew-bridge.service", bridge), ("vox-crew-probe.service", probe_unit),
                          ("vox-crew-attempt.service", attempt)):
        files.append(file("/etc/systemd/system/" + name, content))
    config = {"write_files": files, "runcmd": [
        "systemctl daemon-reload",
        f"systemctl enable --now '{mount_unit}'",
        "systemctl enable --now vox-crew-setup.service",
        "systemctl enable --now vox-crew-bridge.service",
    ]}
    return "#cloud-config\n" + json.dumps(config, indent=2) + "\n"


def production(image, crew_key, *, live=False):
    image_ref(image)
    if not re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\n]*)?", crew_key.strip()):
        raise ValueError("Supply only the crew host's public key.")
    text = (HERE.parent / "cloud-init.yaml").read_text()
    text = text.replace("${VOX_IMAGE}", image).replace("${VOX_FETCH_SCRIPT_B64}",
        base64.b64encode((HERE.parent / "fetch-service-env.sh").read_bytes()).decode())
    additions = [
        file("/etc/ssh/sshd_config.d/00-vox-bridge.conf", (HERE / "production-bridge.conf").read_text()),
        file("/etc/ssh/voxbridge.keys", "restrict,port-forwarding,permitopen=\"127.0.0.1:8080\" " + crew_key.strip() + "\n"),
        file("/etc/vox/install-production-bridge.sh", (HERE / "install-production-bridge.sh").read_text(), "0700"),
    ]
    entries = "".join("  - " + json.dumps(entry) + "\n" for entry in additions)
    text = text.replace("runcmd:\n", entries + "\nruncmd:\n")
    text += "  - bash /etc/vox/install-production-bridge.sh\n"
    if live:
        text = text.replace("--env-file /etc/vox/service.env", "--env GOOGLE_GENAI_USE_VERTEXAI=true --env GOOGLE_CLOUD_PROJECT=studio-prod-7f3a --env GOOGLE_CLOUD_LOCATION=europe-west1 --env-file /etc/vox/service.env")
    if "${" in text:
        raise ValueError("Unresolved Production template placeholder.")
    return text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("crew", "production"))
    parser.add_argument("--image", required=True)
    parser.add_argument("--public-key", type=Path, required=True)
    parser.add_argument("--production-ip", default="10.132.0.2")
    parser.add_argument("--run-id", help="Existing public Run identifier, not its storage directory name")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--live", action="store_true", help="Install the bounded milestone-2 provider configuration")
    args = parser.parse_args()
    if args.kind == "crew" and not args.run_id:
        parser.error("crew requires --run-id from a public Run result")
    key = args.public_key.read_text().strip()
    output = (crew(args.image, args.production_ip, key, args.run_id, live=args.live) if args.kind == "crew"
              else production(args.image, key, live=args.live))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
