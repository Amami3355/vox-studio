"""Image creation is deterministic around the provider and resumable around spend."""

from __future__ import annotations

import asyncio
import base64
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest

from vox_crew.crew_contract import OperatorPolicy, ProviderMode, VisualBible, VisualVocabulary
from vox_crew.image_generation import (
    AssetRequirement,
    GoogleImagenAdapter,
    ImageGrant,
    ImageGrantLedger,
    ImageJobCoordinator,
    ImageJobStatus,
    ImageJob,
    InMemoryImageJobStore,
    RecordedImageAdapter,
    derive_generation_request,
)


PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def requirement(identity: str = "harbour-ferry") -> AssetRequirement:
    return AssetRequirement.from_mapping(
        {
            "type": "image",
            "subject": "A passenger ferry approaching a harbour at dusk",
            "treatment": "photo",
            "orientation": "landscape",
            "identityKey": identity,
        }
    )


def bible() -> VisualBible:
    vocabulary = VisualVocabulary(
        themes=frozenset({"editorial-cold"}),
        motion_intents=frozenset({"measured"}),
        color_roles=frozenset({"ground", "accent"}),
        treatments=frozenset({"documentary", "glossy"}),
    )
    return VisualBible.from_mapping(
        {
            "schemaVersion": 1,
            "theme": "editorial-cold",
            "motionIntent": ["measured"],
            "colorRoles": ["ground", "accent"],
            "treatments": ["documentary"],
            "motifs": ["quiet horizon"],
            "forbiddenTreatments": ["glossy"],
        },
        vocabulary,
    )


def policy(mode: str, grant_id: str | None = None) -> OperatorPolicy:
    return OperatorPolicy.from_mapping(
        {
            "schemaVersion": 1,
            "research": {"mode": "recorded", "grantId": None},
            "models": {"mode": "recorded", "grantId": None},
            "images": {"mode": mode, "grantId": grant_id},
            "recording": {"mode": "recorded", "grantId": None},
        }
    )


PALETTE = {"editorial-cold": {"ground": "#0d121a", "accent": "#ff5a1f"}}


def test_prompt_derivation_is_pure_and_identity_does_not_become_style_prose() -> None:
    first = derive_generation_request(requirement("ferry-one"), "16:9", bible(), PALETTE)
    again = derive_generation_request(requirement("ferry-one"), "16:9", bible(), PALETTE)
    other_identity = derive_generation_request(
        requirement("ferry-two"), "16:9", bible(), PALETTE
    )

    assert first == again
    assert first.prompt == other_identity.prompt
    assert first.request_sha256 == other_identity.request_sha256
    assert "ferry-one" not in first.prompt
    assert "16:9" in first.prompt
    assert "#0d121a" in first.prompt


def test_recorded_generation_returns_a_candidate_then_accepts_only_its_exact_digest() -> None:
    adapter = RecordedImageAdapter(PNG, "image/png")
    coordinator = ImageJobCoordinator(adapter, InMemoryImageJobStore())
    request = derive_generation_request(requirement(), "16:9", bible(), PALETTE)

    job = asyncio.run(coordinator.start(requirement(), request, policy("recorded").images))
    assert job.status is ImageJobStatus.CANDIDATE
    assert job.candidate is not None
    assert job.candidate.artifact.size_bytes == len(PNG)
    assert job.candidate.width == job.candidate.height == 1
    assert adapter.calls == 1

    with pytest.raises(ValueError, match="digest"):
        asyncio.run(coordinator.accept(job.id, "00" * 32))
    accepted = asyncio.run(coordinator.accept(job.id, job.candidate.artifact.sha256))
    assert accepted.status is ImageJobStatus.ACCEPTED

    assert ImageJob.from_mapping(accepted.to_mapping()) == accepted
    with pytest.raises(ValueError, match="providerRunId"):
        ImageJob.from_mapping({**accepted.to_mapping(), "providerRunId": "private"})


class FakeModels:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def generate_images(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        image = SimpleNamespace(image_bytes=PNG, mime_type="image/png")
        return SimpleNamespace(generated_images=[SimpleNamespace(image=image)])


class FakeClient:
    def __init__(self, models: FakeModels) -> None:
        self.aio = SimpleNamespace(models=models)
        self.closed = False

    def close(self) -> None:
        self.closed = True


def test_live_and_recorded_adapters_cross_the_same_candidate_contract() -> None:
    models = FakeModels()
    clients: list[FakeClient] = []

    def factory(*, api_key: str) -> FakeClient:
        assert api_key == "google-test-key"
        client = FakeClient(models)
        clients.append(client)
        return client

    live = GoogleImagenAdapter(key_source=lambda: "google-test-key", client_factory=factory)
    recorded = RecordedImageAdapter(PNG, "image/png")
    request = derive_generation_request(requirement(), "16:9", bible(), PALETTE)
    now = datetime(2026, 9, 6, tzinfo=UTC)
    grant = ImageGrant("image-grant-1", request.request_sha256, now + timedelta(minutes=5))

    live_job = asyncio.run(
        ImageJobCoordinator(
            live,
            InMemoryImageJobStore(),
            grants=ImageGrantLedger([grant], now=lambda: now),
        ).start(requirement(), request, policy("live", "image-grant-1").images)
    )
    recorded_job = asyncio.run(
        ImageJobCoordinator(recorded, InMemoryImageJobStore()).start(
            requirement(), request, policy("recorded").images
        )
    )

    assert set(live_job.to_mapping()) == set(recorded_job.to_mapping())
    assert live_job.provider_mode is ProviderMode.LIVE
    assert recorded_job.provider_mode is ProviderMode.RECORDED
    assert models.calls[0]["prompt"] == request.prompt
    assert models.calls[0]["config"].number_of_images == 1
    assert models.calls[0]["config"].aspect_ratio == "16:9"
    assert clients[0].closed is True


@pytest.mark.parametrize("case", ["missing", "expired", "mismatched", "consumed"])
def test_live_spend_grants_are_fail_closed_before_the_provider(case: str) -> None:
    now = datetime(2026, 9, 6, tzinfo=UTC)
    request = derive_generation_request(requirement(), "16:9", bible(), PALETTE)
    grant = ImageGrant(
        "image-grant-1",
        "11" * 32 if case == "mismatched" else request.request_sha256,
        now - timedelta(seconds=1) if case == "expired" else now + timedelta(minutes=5),
    )
    adapter = replace(RecordedImageAdapter(PNG, "image/png"), mode=policy("live", "x").images.mode)
    ledger = ImageGrantLedger([grant], now=lambda: now)
    if case == "consumed":
        asyncio.run(ledger.consume(grant.id, request.request_sha256))
    access = policy("live", None if case == "missing" else grant.id).images

    with pytest.raises(ValueError, match="authorization|grant"):
        asyncio.run(
            ImageJobCoordinator(adapter, InMemoryImageJobStore(), grants=ledger).start(
                requirement(), request, access
            )
        )
    assert adapter.calls == 0


def test_a_cancelled_dispatch_is_observed_but_never_started_again() -> None:
    entered = asyncio.Event()

    class SlowAdapter(RecordedImageAdapter):
        async def generate(self, request: Any) -> Any:
            self.calls += 1
            entered.set()
            await asyncio.Future()

    adapter = SlowAdapter(PNG, "image/png")
    store = InMemoryImageJobStore()
    request = derive_generation_request(requirement(), "16:9", bible(), PALETTE)

    async def cancel() -> None:
        coordinator = ImageJobCoordinator(adapter, store)
        task = asyncio.create_task(
            coordinator.start(requirement(), request, policy("recorded").images)
        )
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(cancel())
    resumed = asyncio.run(
        ImageJobCoordinator(adapter, store).start(
            requirement(), request, policy("recorded").images
        )
    )

    assert adapter.calls == 1
    assert resumed.status is ImageJobStatus.UNCERTAIN
