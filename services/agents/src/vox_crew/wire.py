"""The request signing rule, reimplemented on the crew's side of the boundary.

The trusted service defines this in `packages/production/src/ipc/authentication.ts`. There is no
way for the crew to share that code, so it is written twice, and the two copies are held
together by a recorded vector rather than by either one being run against the other — a test
where both sides are wrong in the same way is the failure that would otherwise hide here.

Three things about the rule are worth stating where they are implemented rather than only where
they are recorded.

**Every field is length-prefixed in bytes.** `12:run.validate` rather than `run.validate`, so no
value can be shifted into its neighbour by choosing a string that contains the separator. The
count is UTF-8 bytes; a reimplementation counting characters agrees with this one on ASCII
forever and disagrees the first time a Brief contains an em dash.

**The domain tag is the first line and it is per-shape.** A MAC computed over a command must not
authenticate a retrieval, and a shared prefix is how two routes end up with one forgeable
surface between them.

**The payload is canonicalised, not serialised.** The bytes the crew signs and the bytes the
service re-serialises are the same bytes only if key order is, so `canonical_json` sorts and
emits without spaces. It is RFC 8785 for the value shapes JSON carries; anything it cannot
represent is refused rather than approximated, because a value silently encoded some other way
produces a MAC the service can never reproduce, and that arrives as a dropped socket with no
reason attached.
"""

from __future__ import annotations

import hmac
import json
from collections.abc import Mapping, Sequence
from hashlib import sha256
from math import isfinite
from typing import Any

PAYLOAD_REQUEST_DOMAIN = "VOX-IPC-PAYLOAD-REQUEST-1"
ARTIFACT_REQUEST_DOMAIN = "VOX-IPC-ARTIFACT-REQUEST-1"
RESPONSE_DOMAIN = "VOX-IPC-RESPONSE-1"
PROTOCOL_VERSION = 1


def canonical_json(value: Any) -> str:
    """RFC 8785 canonical JSON, for the value shapes an envelope payload carries."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return json.dumps(value)
    if isinstance(value, float):
        if not isfinite(value):
            raise TypeError("Canonical JSON rejects non-finite numbers.")
        return json.dumps(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, Mapping):
        members = ",".join(
            f"{json.dumps(str(key), ensure_ascii=False)}:{canonical_json(value[key])}"
            for key in sorted(value)
        )
        return f"{{{members}}}"
    # A `str` is a Sequence too, and is handled above. Sets, tuples of mixed intent and every
    # other iterable are refused rather than guessed at.
    if isinstance(value, list) or (isinstance(value, Sequence) and not isinstance(value, str)):
        return f"[{','.join(canonical_json(member) for member in value)}]"
    raise TypeError(f"Canonical JSON does not carry {type(value).__name__}.")


def _field(value: str) -> str:
    return f"{len(value.encode('utf-8'))}:{value}"


def payload_request_signing_text(
    *,
    request_id: str,
    timestamp_ms: int,
    command: str,
    run_id: str | None,
    payload: Mapping[str, Any] | None,
) -> str:
    """The text a command request's MAC is computed over.

    `run_id` and `payload` are present-and-empty rather than omitted when absent: both become
    `0:`, and a caller that dropped the lines instead would produce a shorter text that still
    looks plausible and never verifies.
    """
    return "\n".join(
        [
            PAYLOAD_REQUEST_DOMAIN,
            _field(request_id),
            _field(str(timestamp_ms)),
            _field(command),
            _field(run_id or ""),
            _field("" if payload is None else canonical_json(payload)),
        ]
    )


def artifact_request_signing_text(
    *,
    request_id: str,
    timestamp_ms: int,
    run_id: str,
    descriptor: Mapping[str, str],
) -> str:
    """The text a retrieval request's MAC is computed over.

    The descriptor's three fields are signed separately rather than as canonical JSON: they are
    three strings, so length-prefixing them is the whole of what canonicalisation would buy.
    """
    return "\n".join(
        [
            ARTIFACT_REQUEST_DOMAIN,
            _field(request_id),
            _field(str(timestamp_ms)),
            _field(run_id),
            _field(descriptor["kind"]),
            _field(descriptor["path"]),
            _field(descriptor["sha256"]),
        ]
    )


def response_signing_text(
    *, request_id: str, exit_code: int, stdout_base64: str, stderr_base64: str
) -> str:
    """The text a command response's MAC is computed over.

    The crew verifies this rather than trusting whatever answered the socket. It is the half of
    the boundary that survives the transport change unchanged: the tunnel says who may connect
    and this says who produced the bytes, and letting the channel answer both is the cheap
    mistake ADR-0018 decision 2 forbids by name.

    **The artifact route has no equivalent and needs none.** Those bytes are authenticated by the
    descriptor's digest, which came from an envelope this rule already covered.
    """
    return "\n".join(
        [
            RESPONSE_DOMAIN,
            _field(request_id),
            _field(str(exit_code)),
            _field(stdout_base64),
            _field(stderr_base64),
        ]
    )


def sign_request(secret: str | bytes, text: str) -> str:
    key = secret.encode("utf-8") if isinstance(secret, str) else secret
    return hmac.new(key, text.encode("utf-8"), sha256).hexdigest()
