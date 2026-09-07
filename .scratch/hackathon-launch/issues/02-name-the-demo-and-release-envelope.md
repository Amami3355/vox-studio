# What result comes first for the September 9 hackathon?

Parent: [Vox Studio: a visible result first, ready for the September 9 hackathon](../map.md)
Type: grilling
Label: wayfinder:grilling
Mode: HITL
Status: resolved
Assignee: codex
Blocked by: none

## Question

Which event and deadline apply, and how should the verified integration requirements change the order of delivery?

The original audience, staffing and demo-envelope questions are preserved in [Who uses the first Studio, with which Brief and limits?](07-confirm-the-demo-envelope.md). Resolving the priority decision does not invent answers to those questions or select a deployment topology.

## Answer

Resolved 2026-09-07 from the user's event link and subsequent instruction to update the map, retain ElevenLabs, handle that last, and prioritize seeing a result.

### Verified event requirements

Agentic Cinema closes September 9, 2026 at 14:00 PDT, equivalent to 21:00 UTC / 22:00 Africa/Tunis. [Official event](https://agentic-cinema.devpost.com/).

The rules accept `google-adk` and `google-genai`; they do not expressly mandate Agent Engine hosting. Parallel requires Search API use at runtime. AI services are restricted to Google Cloud and the chosen partner's built-in AI. A hosted URL, public licensed source repository and public demo video are required; the submission must support English. New-project eligibility also remains to verify. [Official rules, section 7](https://agentic-cinema.devpost.com/rules).

### Repository evidence and implications

- The ADK crew exists. Compute Engine / Cloud Run remain compatible hosting candidates by our reading, not an organizer's approval of this specific deployment.
- [Parallel research](../../../services/agents/src/vox_crew/parallel_research.py) calls `/v1/tasks/runs`. Add Search to actual research and use its returned sources; Task API use alone does not establish the required integration.
- [Image generation](../../../packages/production/src/image/google.ts) builds a Google client with an API key; explicitly configure and verify the Google Cloud model path for images and crew inference.
- [Voice synthesis](../../../packages/voice/src/synthesise.ts) calls ElevenLabs. Its timestamps feed our alignment; replacing it affects the adapter, provider contracts and synchronization proof.

### User decision and delivery order

The user explicitly wants a visible result before voice migration. Keep ElevenLabs operational for the first real preview and initial Studio. Deliver cloud connectivity, real research including Parallel Search, a narrated preview, browser integration and recovery evidence before the final voice work. Do not make voice migration a dependency of those milestones.

Handle the ElevenLabs replacement/compliance question as the final engineering milestone, before final submission verification and capture. The user has deferred it, not selected a replacement provider or waived the external rules. Until corrected, report the visible product as using ElevenLabs with an unresolved eligibility gap; do not claim full compliance.

September 8 is the internal demonstrable-product target. It is not a second submission cutoff. The route must protect time for final voice work and a rerun before the actual deadline. No provider migration or infrastructure change was performed by this decision update.

## Comments

2026-09-07: Split the former broad release-envelope question: confirmed deadline, rules and delivery priority are resolved here; remaining human choices are open in the linked audience ticket. This makes the topology decision available without falsely resolving audience or staffing.
