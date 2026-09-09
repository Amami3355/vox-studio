"""Observed usage and a partial list-price estimate, never spending authority.

Rates are captured at dispatch. Replaying saved responses does not create consumption.
Missing measurements and unsupported prices remain unknown, including historical calls.
"""
from __future__ import annotations

from datetime import datetime, timezone

PRICE_SOURCE = "https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing"
PRICE_CHECKED = "2026-09-09"
TOKEN_FIELDS = {
    "input": "prompt_token_count", "cached": "cached_content_token_count",
    "output": "candidates_token_count", "reasoning": "thoughts_token_count",
    "tools": "tool_use_prompt_token_count", "total": "total_token_count",
}
COUNTERS = ("calls", "respondedCalls", "failedCalls", "pendingCalls", "meteredCalls", "costedCalls")


def price_at_dispatch(provider, model, location, *, now=None):
    """Published standard global rates, in integer nano-USD per token.

    No guessing for other endpoints, model aliases, modalities or negotiated billing.
    A later pricing revision must not reprice already dispatched work.
    """
    day = (now or datetime.now(timezone.utc)).date().isoformat()
    if provider != "google-cloud" or location != "global" or not PRICE_CHECKED <= day < "2027-01-01":
        return None
    rates = {"gemini-3.6-flash": (750, 75, 3750), "gemini-3.5-flash": (1500, 150, 9000)}
    if model not in rates:
        return None
    incoming, cached, outgoing = rates[model]
    return {"version": f"google-global-standard-{PRICE_CHECKED}", "input": incoming,
            "cached": cached, "output": outgoing}


def nonnegative(value):
    return type(value) is int and value >= 0


def estimated_nano_usd(dispatch, response):
    price, counts = dispatch.get("price"), response.get("usage", {})
    if not price or response.get("trafficType") not in (None, "ON_DEMAND"):
        return None
    # Absent cache accounting in old journals is unknown, not a zero-cost cache.
    required = ("prompt_token_count", "cached_content_token_count", "candidates_token_count",
                "thoughts_token_count", "tool_use_prompt_token_count")
    if not all(nonnegative(counts.get(field)) for field in required):
        return None
    incoming, cached = counts[required[0]], counts[required[1]]
    # Tool-use input accounting needs its own verified tariff treatment.
    if cached > incoming or counts[required[4]]:
        return None
    return ((incoming - cached) * price["input"] + cached * price["cached"]
            + (counts[required[2]] + counts[required[3]]) * price["output"])


def empty_row(provider, model, role):
    return {"provider": provider, "model": model, "role": role,
            **{key: 0 for key in COUNTERS}, "tokens": {key: None for key in TOKEN_FIELDS},
            "tokenReports": {key: 0 for key in TOKEN_FIELDS},
            "estimatedNanoUsd": None, "priceVersions": []}


def consumption_records(records):
    dispatches = {row["id"]: row for row in records if row["status"] == "dispatched"}
    responses = {row["id"]: row for row in records if row["status"] == "responded"}
    rows = []
    for identity, dispatch in dispatches.items():
        row = empty_row(dispatch.get("provider", "unknown"), dispatch.get("model", "unknown"), dispatch.get("role", "unknown"))
        response = responses.get(identity)
        row["calls"] = 1
        row["respondedCalls"] = int(response is not None)
        row["pendingCalls"] = int(response is None)
        if response is not None:
            row["failedCalls"] = int(response.get("providerOutcome") == "failed")
            counts = response.get("usage", {})
            row["tokens"] = {key: counts[field] if nonnegative(counts.get(field)) else None
                             for key, field in TOKEN_FIELDS.items()}
            row["tokenReports"] = {key: int(value is not None) for key, value in row["tokens"].items()}
            row["meteredCalls"] = int(row["tokens"]["total"] is not None)
            row["estimatedNanoUsd"] = estimated_nano_usd(dispatch, response)
            row["costedCalls"] = int(row["estimatedNanoUsd"] is not None)
            if row["costedCalls"]:
                row["priceVersions"] = [dispatch["price"]["version"]]
        rows.append(row)
    return merge_consumption([{"rows": rows}])


def merge_consumption(summaries):
    """Merge disjoint journals or snapshots, retaining every historical image branch."""
    groups = {}
    for summary in summaries:
        for row in (summary or {}).get("rows", []):
            key = tuple(row.get(field, "unknown") for field in ("provider", "model", "role"))
            group = groups.setdefault(key, empty_row(*key))
            for field in COUNTERS:
                value = row.get(field)
                if nonnegative(value):
                    group[field] += value
            for field in TOKEN_FIELDS:
                value = row.get("tokens", {}).get(field)
                if nonnegative(value):
                    group["tokens"][field] = (group["tokens"][field] or 0) + value
                    group["tokenReports"][field] += row.get("tokenReports", {}).get(field, 0)
            value = row.get("estimatedNanoUsd")
            if nonnegative(value):
                group["estimatedNanoUsd"] = (group["estimatedNanoUsd"] or 0) + value
            group["priceVersions"] = sorted(set(group["priceVersions"]) | set(row.get("priceVersions", [])))
    rows = [groups[key] for key in sorted(groups)]
    return {"version": 1, "rows": rows}


def public_consumption(state, *, saved=None):
    """Project only counters and prices; never return journal answers or request data."""
    provider_usage = state.get("providerUsage", {})
    measured = provider_usage.get("consumption") or saved or {}
    report = merge_consumption([measured])
    rows = report["rows"]
    covered = sum(row["calls"] for row in rows)
    costed = sum(row["costedCalls"] for row in rows)
    total_calls = max(provider_usage.get("calls", 0), covered)
    prices = [row["estimatedNanoUsd"] for row in rows if row["estimatedNanoUsd"] is not None]
    return {**report, "currency": "USD", "totalCalls": total_calls,
            "unattributedCalls": max(0, total_calls - covered),
            "meteredCalls": sum(row["meteredCalls"] for row in rows),
            "pendingCalls": sum(row["pendingCalls"] for row in rows),
            "costedCalls": costed, "unpricedCalls": total_calls - costed,
            "estimatedSubtotalUsd": sum(prices) / 1_000_000_000 if prices else None,
            "priceSource": PRICE_SOURCE, "priceCheckedAt": PRICE_CHECKED}
