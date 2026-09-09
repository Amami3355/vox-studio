# Studio interface redesign

Scope: preserve the information and production actions in apps/studio. Base: c5b22df.
Worktree: vox-studio-parallel. Branch: feat/studio-web-redesign.

## Existing interface
- React and native CSS, no component library. Orange accent #df572c, warm neutral background #f6f5f1, green production statuses.
- System sans font fallback; many labels and mobile text are 6-11px. Rounded containers mix several radius scales.
- Private login, new-film brief, film selected by ?film= ID; library navigation and Story / Sources / Images tabs.
- Film title, requested duration, narration language, creation date and recorded-production marker.
- Five production milestones, parallel illustration activity, measured render counters and save times.
- Playback/download, image approval/rejection, start/stop/resume/correction controls.
- Full narration, source links, latest illustrations and previous versions with review findings.
- Production notes, saved brief, correction history, film review findings.
- Consumption summary, partial pricing caveats, operation/token tables and report export.
- Existing metadata and route/query structure retained. This is a private product interface, not an SEO migration.

## Findings and direction
The player is pushed down by progress details and consumption nested inside decisions.
The current stage is not distinguished from future incomplete stages. Notes use internal phase names.
Increase reading sizes and contrast. Put film metadata and saved brief together, followed by milestones
and the current update. Keep preview and produced content in the main column, actions and production notes
in a secondary column. Place consumption in its own full-width section.
Preserve navigation labels, form field order, request payloads, production authority and all existing information.
Use native semantic HTML for the product flows and the existing CSS foundation.
Design variance 4, motion 2, density 5. Orange remains the brand accent; success/error colors convey state.
Use 8px controls and 12px surfaces. Both system light/dark themes. No decorative generated media.

## Validation plan
Run the existing browser suite on port 8782 with a disposable workspace and no production worker.
Add browser scenarios for current-stage accuracy, keyboard tabs, information preservation,
and desktop/mobile light/dark layouts. Capture before/after screenshots and inspect them.
Run studio typecheck, production build, changed-file lint and Lighthouse on the isolated preview.

## Completed implementation
- Video information is grouped at the top; the original brief opens in place.
- A current-operation message precedes five explicit milestone states. The phase can return to
  an earlier or already completed milestone during a correction; queued jobs show no active step.
- The preview and Story / Sources / Images remain central. Controls and latest-first notes sit beside
  them on desktop; required actions move ahead of the preview on smaller screens.
- Consumption is separate from production decisions and keeps all measurements, caveats and exports.
- Larger reading sizes, consistent radii, stronger contrast and system light/dark themes.
- Arrow keys, Home/End, roving tab focus, a focusable panel, a skip link and current-film semantics.
- Existing wordmark retained, with its four-bar mark reused as the favicon.
- No new application dependencies, request changes, production worker changes or deployment.

## Verification results
- Studio TypeScript check passed.
- Production build passed. Final JS is 239.36 kB (74.04 kB gzip); CSS is 27.77 kB (6.20 kB gzip).
- Biome checks passed for all changed TS/TSX/CSS files; git diff --check passed.
- All 12 existing browser scenarios passed in two groups on port 8782.
  Separate groups avoid the existing sign-in rate limit on the disposable test server.
- Two additional browser tests passed: active/corrected/paused/queued/completed milestones;
  information retention, keyboard tabs, prior image versions, findings and decisions.
- Layout checks passed at 320, 390, 768 and 1440px in light and dark modes, including
  button overflow and page overflow checks. No browser page errors in the content scenario.
- Real server screens for login, new film and measured rendering were captured in both themes.
- Inspected desktop production, mobile production, correction, login and creation screenshots.

### Lighthouse desktop, local fixture
Final report: lighthouse-final.report.html / lighthouse-final.report.json.
Performance 99/100,
accessibility 100/100,
best practices 100/100.
LCP 0.55s;
CLS 0.063.
These are local synthetic measurements, not production field metrics or an INP measurement.
The final report has no runtime error; logo label and console-error checks pass.
The Windows Lighthouse launcher returned an error while removing its temporary browser directory
after writing the final reports. See lighthouse-run.log; the report itself completed.

### Contextual skill pre-flight
Applicable: audited identity/content, explicit direction, typography, spacing, coherent tokens,
contrast, keyboard operation, readable actions, real state values, responsive layout,
reduced motion and both themes. Existing API loading/error/empty states remain.
Not applicable: marketing hero imagery, social proof, bento grids, testimonials, scroll animation,
or a replacement component system. Existing decorative assets and app icons are retained.
Video captions remain the existing limitation: full narration is in Story, with no new timed captions.

### Local review
Preview server: http://127.0.0.1:8783
Access code: browser-test-workspace-only (disposable fixture only).
No worker is running; preview jobs demonstrate rendering, image correction and consumption.
