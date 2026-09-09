"""Output capacity for the pinned models, separate from user attempt allowances."""

# Published model capabilities, not a film length or a requested response length.
# https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-6-flash
MODEL_OUTPUT_LIMITS = {"gemini-3.5-flash": 65536, "gemini-3.6-flash": 65536}
LONG_OUTPUT_ROLES = frozenset({"SceneAuthor", "PlanRepairAgent"})


def role_output_tokens(role, model, requested=None):
    maximum = MODEL_OUTPUT_LIMITS.get(model)
    initial = maximum if role in LONG_OUTPUT_ROLES and maximum else 8192
    # An older saved retry must not reduce the newly available authoring capacity.
    return min(maximum or max(initial, 32768), max(initial, requested or initial))


def recovery_output_tokens(calls, *, grow):
    capacities = []
    for call in calls:
        previous = call.get("maxOutputTokens", 8192)
        maximum = MODEL_OUTPUT_LIMITS.get(call.get("model"))
        if call["role"] in LONG_OUTPUT_ROLES and maximum:
            capacities.append(maximum)
        else:
            capacities.append(min(maximum or max(previous, 32768), previous * 2 if grow else previous))
    return max(capacities)
