# Completed film cannot play — September 9, 2026

Film: `22f01237-b95e-4ffa-a3f3-bca4331192fa`, the relativity film.
MP4: `cbf5b17cceb9884a10efb8408f8d462d16d27b46d63412b5207c8775c361b9ce`.

## Cause and reproduction

Production completed and the five required images are approved. The saved MP4 is
41,496,998 bytes, H.264/AAC, 1920x1080, duration 127.147 seconds. Its saved hash matches
the published descriptor. The 180-second request is an editorial target, not the
delivered duration.

The actual browser reported MEDIA_ELEMENT_ERROR / format error because its request
received HTTP 500 with an empty HTML response. HEAD returned 200 with the correct
video length, and bounded/suffix byte ranges returned 206 with correct MP4 bytes.
An open-ended `Range: bytes=0-` returned 500. The fixed-length response exceeds the
Cloud Run HTTP/1 response limit of 32 MiB. This failure occurs at the public proxy,
after successful rendering and file verification.

References: [Cloud Run limits](https://docs.cloud.google.com/run/quotas),
[HTTP/2 configuration](https://docs.cloud.google.com/run/docs/configuring/http2),
[nginx HTTP/2](https://nginx.org/en/docs/http/ngx_http_v2_module.html#http2).
Context7 library resolution and a targeted SDK documentation query were attempted;
the index returned no matching documentation, so the official primary pages above
were used.

## Correction

Enable cleartext HTTP/2 in the existing nginx listener and deploy Cloud Run with
`--use-http2` / port name `h2c`. The API connection remains HTTP/1.1 with buffering
disabled; media bytes, headers, authentication and range handling are preserved.
No worker/API/Production service was restarted and no film was regenerated.

The proxy image derives from the exact previously deployed nginx image and only
changes nginx.conf. New image and revision are in `deployment/staged.json`.
Revision `vox-studio-video-775bd7d8af20` was staged with zero canonical traffic, tested
on its tagged URL, then promoted to 100%. The temporary tag was removed. Resource
limits, service account, private VPC routing and application authentication remain
unchanged; `deployment/deployment-verification.json` verifies these settings.

## Verification

`deploy/studio/proxy/test_streaming.py` exercises the actual nginx container with a
synthetic response over 40 MiB: full download, open-ended range, bounded/suffix ranges,
HEAD, private cache headers and anonymous rejection. HTTP/2 cases fail before the
configuration fix and pass after it. nginx configuration validation also passes.

The staged and canonical browser checks use the actual delivered film: visible
decoded video, advancing playback, seeking near the end, mobile playback, full
41,496,998-byte download with matching SHA-256, byte-range comparison, and anonymous
HTTP 401. See `deployment/staged-verification.json` and
`deployment/live-verification.json`; screenshots and the verified downloaded MP4
are in the same directory.

The film stays ready, with consumption unchanged at 41 provider calls, 11 image
generation attempts and one recording. “Improve the film visuals” is an optional
correction form, not an unfinished production stage.

The missing regression coverage was delivery of a >32 MiB file through the actual
public edge. Technical decoding alone cannot prove browser delivery. The deployment
runbook now requires this large-file playback/download check after proxy changes.
