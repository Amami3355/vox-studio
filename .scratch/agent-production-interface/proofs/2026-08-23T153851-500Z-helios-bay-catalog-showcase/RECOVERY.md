# Helios Bay catalogue showcase recovery

The fresh sandboxed Codex agent authored and validated the full Helios Bay plan, recorded one
ElevenLabs Take and compiled the document successfully. The original proof process then failed
because the generic IPC socket timeout closed the long-running `run.render` request after 120
seconds. The bound plan, Take and compiled document remained fresh and were preserved.

`recovered-preview.mp4` was rendered afterward by the same Remotion adapter directly from the
preserved compiled document and Take audio. No new agent pass or provider request was made during
recovery. Because this render did not produce a signed `run.render` receipt, it is a recovered
preview rather than a formally passing proof bundle.

## Recovered result

- Preview: `recovered-preview.mp4`
- Preview SHA-256: `8179cea7a0b9d1ffd78c1429fd444ae52d8f97d7b2fc571d47b2e7c8f432ee04`
- Preview duration: 139.029333 seconds
- Video: H.264, 1920x1080
- Audio: AAC, stereo, 48 kHz; maximum level -5.5 dBFS
- Take id: `b20eb331c6e7`
- Take audio SHA-256: `a5b39adddbd21a60f165499a9ae81daa9266b5ad505395d952a51f957c47d1a3`
- Take duration: 139.154286 seconds
- Narration: 275 words across eight beats
- Catalogue coverage: eight scenes, all eight current capabilities exactly once
- Event coverage: every scene has at least one supported event
- Compilation: green with two quality-only `ASSET_PLACEHOLDER` warnings
- Provider dispatches in this run: one, during `production run record`

The `recovery/` directory contains the exact plan, compiled document, compile report, Take
manifest, alignment and audio used for the recovered preview. `review/contact-sheet.jpg` samples
the eight-scene timeline.
