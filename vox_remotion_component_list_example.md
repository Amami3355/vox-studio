# Catalogue exhaustif de composants Remotion — documentaire explicatif style Vox

**Total : 198 composants**

Ce catalogue est pensé pour une architecture où Gemini/ADK produit des scènes structurées et Remotion ne rend que des composants autorisés et validés.


## 01 — Foundations

### `SceneShell` — P0 — Core

- **Rôle :** Base wrapper for every scene: safe areas, background, timing and clipping.
- **Props principales :** `duration, background, padding, safeArea, overflow`
- **Variantes :** light | dark | paper | transparent
- **Notes :** All scene components should compose inside this.

### `LayerStack` — P0 — Core

- **Rôle :** Deterministic z-order container for visual layers.
- **Props principales :** `layers[], blendMode, opacity`
- **Variantes :** fixed | keyed

### `ResponsiveCanvas` — P0 — Core

- **Rôle :** Scale a composition across 16:9, 9:16, 1:1 and other outputs.
- **Props principales :** `designWidth, designHeight, fit, anchor`
- **Variantes :** contain | cover

### `SafeAreaGuides` — P2 — Extended

- **Rôle :** Preview-only title/action safe guides.
- **Props principales :** `show, margins`
- **Variantes :** 16:9 | 9:16

### `GridLayout` — P1 — Core

- **Rôle :** Reusable editorial grid for text/image/data compositions.
- **Props principales :** `columns, rows, gap, areas`
- **Variantes :** 2-col | 3-col | asymmetric

### `SplitScreen` — P1 — Core

- **Rôle :** Two-way comparison or simultaneous evidence.
- **Props principales :** `left, right, ratio, divider`
- **Variantes :** 50/50 | 60/40 | vertical

### `MultiPanel` — P1 — Core

- **Rôle :** 3–6 panel montage for examples, sources or comparisons.
- **Props principales :** `items[], layout, gap`
- **Variantes :** grid | strip | masonry

### `EditorialFrame` — P1 — Core

- **Rôle :** Adds consistent margins, corner treatments and visual rhythm.
- **Props principales :** `frameStyle, inset, stroke, shadow`
- **Variantes :** clean | paper | archival

### `BackgroundTexture` — P1 — Core

- **Rôle :** Subtle paper, grain, noise or halftone texture.
- **Props principales :** `texture, intensity, scale, seed`
- **Variantes :** paper | grain | halftone | dust
- **Notes :** Keep subtle; texture should not impair legibility.
- **Base de recherche :** https://arxiv.org/abs/2309.14642

### `ColorWash` — P2 — Extended

- **Rôle :** Animated or static color field used to separate chapters.
- **Props principales :** `color, gradient, opacity, animate`
- **Variantes :** solid | gradient


## 02 — Typography

### `HeadlineReveal` — P0 — Core

- **Rôle :** Large editorial headline timed to narration.
- **Props principales :** `text, wordsPerBeat, align, maxWidth`
- **Variantes :** wipe | word-by-word | line-by-line
- **Base de recherche :** https://www.pressclubinstitute.org/2026/07/21/vox-video-producer-nate-krieger-on-how-to-create-engaging-visual-journalism/

### `KineticSentence` — P1 — Core

- **Rôle :** Sentence with selected words emphasized through scale/position.
- **Props principales :** `text, emphasis[], timing[], style`
- **Variantes :** scale | weight | underline | highlight

### `KeywordPunch` — P1 — Core

- **Rôle :** Single keyword or short phrase used as a visual beat.
- **Props principales :** `text, entrance, exit, accent`
- **Variantes :** slam | fade | crop | type

### `TypewriterText` — P2 — Extended

- **Rôle :** Typed text for documents, historic context and search-like moments.
- **Props principales :** `text, cps, cursor, soundCue`
- **Variantes :** mono | serif | terminal

### `CaptionBlock` — P1 — Core

- **Rôle :** Editorial body copy placed beside visuals.
- **Props principales :** `text, width, lineClamp, align`
- **Variantes :** body | note | explainer

### `LabelTag` — P0 — Core

- **Rôle :** Compact label for map points, chart annotations and objects.
- **Props principales :** `text, anchor, leaderLine, style`
- **Variantes :** pill | boxed | plain

### `DefinitionCard` — P1 — Core

- **Rôle :** Term + short definition shown as an explainer insert.
- **Props principales :** `term, definition, source`
- **Variantes :** card | full-screen

### `QuestionCard` — P1 — Core

- **Rôle :** Narrative question that opens a section.
- **Props principales :** `question, kicker, background`
- **Variantes :** full-screen | overlay

### `ChapterTitle` — P0 — Core

- **Rôle :** Chapter number, title and optional subtitle.
- **Props principales :** `number, title, subtitle, duration`
- **Variantes :** minimal | collage | data

### `LowerThird` — P0 — Core

- **Rôle :** Name/title/location identification.
- **Props principales :** `name, role, organization, location`
- **Variantes :** 1-line | 2-line | source-tagged

### `SuperscriptSource` — P1 — Core

- **Rôle :** Small source/date marker adjacent to a statement.
- **Props principales :** `label, url, date`
- **Variantes :** numeric | short-domain

### `TextHighlight` — P0 — Core

- **Rôle :** Animated highlight behind specific words or sentences.
- **Props principales :** `text, ranges[], color, timing`
- **Variantes :** marker | underline | box

### `RedactionText` — P2 — Extended

- **Rôle :** Redacted text reveal for documents or sensitive evidence.
- **Props principales :** `text, redactions[], revealAt`
- **Variantes :** black-bar | blur

### `NumberTicker` — P1 — Core

- **Rôle :** Animated numeric count-up/down.
- **Props principales :** `from, to, decimals, suffix, duration`
- **Variantes :** linear | spring | stepped


## 03 — Narrative

### `ColdOpenHook` — P0 — Core

- **Rôle :** Fast opening combining a claim, image and/or statistic.
- **Props principales :** `headline, asset, stat, duration`
- **Variantes :** question | contradiction | startling-stat
- **Base de recherche :** https://www.pressclubinstitute.org/2026/07/21/vox-video-producer-nate-krieger-on-how-to-create-engaging-visual-journalism/

### `PremiseSetup` — P1 — Core

- **Rôle :** Defines the central question and why it matters.
- **Props principales :** `question, context, visual`
- **Variantes :** text-led | montage

### `ContextReset` — P1 — Core

- **Rôle :** Brief orientation before a complex section.
- **Props principales :** `title, summary, icon`
- **Variantes :** full-screen | sidebar

### `ActDivider` — P1 — Core

- **Rôle :** Separates major narrative acts.
- **Props principales :** `act, title, visualMotif`
- **Variantes :** minimal | cinematic

### `RecapCard` — P1 — Core

- **Rôle :** Summarizes established facts before moving on.
- **Props principales :** `bullets[], citations[]`
- **Variantes :** stack | checklist

### `RevealCard` — P1 — Core

- **Rôle :** Delays key information then reveals it with emphasis.
- **Props principales :** `setup, reveal, timing`
- **Variantes :** mask | crop | flip

### `CounterArgumentCard` — P1 — Core

- **Rôle :** Presents an opposing interpretation fairly.
- **Props principales :** `claim, attribution, evidence`
- **Variantes :** quote-led | split

### `UncertaintyCard` — P0 — Core

- **Rôle :** Explicitly marks ambiguity, missing evidence or unresolved claims.
- **Props principales :** `statement, confidence, reasons[]`
- **Variantes :** warning | neutral

### `ConclusionSynthesis` — P1 — Core

- **Rôle :** Combines the strongest evidence into a final takeaway.
- **Props principales :** `takeaways[], closingLine`
- **Variantes :** text | montage

### `EndSlate` — P0 — Core

- **Rôle :** Credits, sources link, production credits and CTA.
- **Props principales :** `title, credits, links, logo`
- **Variantes :** credits | CTA | both


## 04 — Archive & Photos

### `PhotoKenBurns` — P0 — Core

- **Rôle :** Slow pan/zoom across a still image.
- **Props principales :** `src, fromCrop, toCrop, duration, easing`
- **Variantes :** push-in | pull-out | pan
- **Base de recherche :** https://www.pressclubinstitute.org/2026/07/21/vox-video-producer-nate-krieger-on-how-to-create-engaging-visual-journalism/

### `PhotoCutout` — P1 — Core

- **Rôle :** Foreground subject cut out from a photo for layered collage.
- **Props principales :** `src, mask, shadow, position, parallax`
- **Variantes :** person | object | building

### `PhotoStack` — P1 — Core

- **Rôle :** Layered stack of photos entering sequentially.
- **Props principales :** `images[], rotations[], offsets[]`
- **Variantes :** polaroid | paper | clean

### `PhotoContactSheet` — P1 — Core

- **Rôle :** Grid of related archival images.
- **Props principales :** `images[], captions[], columns`
- **Variantes :** static | sequential-highlight

### `BeforeAfterPhoto` — P1 — Core

- **Rôle :** Compare two photos of the same place/object.
- **Props principales :** `before, after, labels, split`
- **Variantes :** slider | dissolve | side-by-side

### `ArchivalFrame` — P1 — Core

- **Rôle :** Period-specific frame around footage or photo.
- **Props principales :** `src, date, location, texture`
- **Variantes :** film | TV | newspaper

### `ImageAnnotation` — P0 — Core

- **Rôle :** Arrows, circles, labels and highlights on an image.
- **Props principales :** `src, annotations[], timing`
- **Variantes :** arrow | circle | box | label

### `ImageZoomCallout` — P0 — Core

- **Rôle :** Zoom into a relevant region and annotate it.
- **Props principales :** `src, region, zoom, callout`
- **Variantes :** single | sequential

### `PortraitProfile` — P1 — Core

- **Rôle :** Portrait + identity + key fact.
- **Props principales :** `photo, name, role, fact, source`
- **Variantes :** clean | cutout

### `ObjectEvidence` — P2 — Extended

- **Rôle :** Isolate a physical object/document as visual evidence.
- **Props principales :** `image, label, annotations[]`
- **Variantes :** museum | desk | cutout


## 05 — Documents & Evidence

### `DocumentViewer` — P0 — Core

- **Rôle :** Render a PDF/page/screenshot inside an editorial frame.
- **Props principales :** `asset, page, crop, caption`
- **Variantes :** full | desk | browser

### `DocumentHighlight` — P0 — Core

- **Rôle :** Animate highlight over exact sentence or table row.
- **Props principales :** `asset, boxes[], timing, label`
- **Variantes :** marker | translucent-box

### `DocumentZoom` — P0 — Core

- **Rôle :** Push from full document into a key passage.
- **Props principales :** `asset, targetRect, duration`
- **Variantes :** single | multi-step

### `QuoteFromDocument` — P0 — Core

- **Rôle :** Extract a quoted passage while keeping source context visible.
- **Props principales :** `asset, quote, source, page`
- **Variantes :** overlay | pull-out

### `SourceMetadataCard` — P0 — Core

- **Rôle :** Shows author, publication, date, URL and document type.
- **Props principales :** `author, publisher, date, url, type`
- **Variantes :** compact | full

### `EvidenceChain` — P0 — Core

- **Rôle :** Visually connect claim → source → passage.
- **Props principales :** `claim, source, passage, confidence`
- **Variantes :** horizontal | vertical

### `SourceComparison` — P0 — Core

- **Rôle :** Compare two sources that agree or conflict.
- **Props principales :** `sources[], excerpts[], relation`
- **Variantes :** agreement | contradiction

### `FactStatusBadge` — P0 — Core

- **Rôle :** Status for claim verification.
- **Props principales :** `status, confidence, rationale`
- **Variantes :** verified | supported | disputed | unverified

### `NewspaperClipping` — P1 — Core

- **Rôle :** Headline + clipping treatment for press archives.
- **Props principales :** `image, publication, date, crop`
- **Variantes :** paper | clean

### `WebArticleCapture` — P1 — Core

- **Rôle :** Browser-like article excerpt with source attribution.
- **Props principales :** `screenshot, domain, title, date, highlight`
- **Variantes :** desktop | mobile


## 06 — Maps & Geography

### `BaseMap` — P0 — Core

- **Rôle :** Minimal map foundation with controllable labels and styling.
- **Props principales :** `center, zoom, style, labels, bounds`
- **Variantes :** light | dark | paper
- **Base de recherche :** https://mapimator.com/blog/how-to-replicate-vox-style-map-animations

### `MapZoomJourney` — P0 — Core

- **Rôle :** Smooth camera travel from world/region to a target.
- **Props principales :** `waypoints[], zooms[], durations[]`
- **Variantes :** 2D | slight-tilt
- **Base de recherche :** https://mapimator.com/blog/how-to-replicate-vox-style-map-animations

### `MapRegionHighlight` — P0 — Core

- **Rôle :** Highlight a country, state, district or polygon.
- **Props principales :** `geometry, fill, opacity, label`
- **Variantes :** single | multiple
- **Base de recherche :** https://mapimator.com/blog/how-to-replicate-vox-style-map-animations

### `MapRouteDraw` — P0 — Core

- **Rôle :** Draw a route over time.
- **Props principales :** `path[], stroke, width, speed, markers`
- **Variantes :** road | migration | trade | journey
- **Base de recherche :** https://mapimator.com/blog/how-to-replicate-vox-style-map-animations

### `MapPointReveal` — P0 — Core

- **Rôle :** Reveal cities, facilities or events as dots/labels.
- **Props principales :** `points[], order, labels`
- **Variantes :** sequential | clustered

### `MapFlowArcs` — P1 — Core

- **Rôle :** Animate flows between regions.
- **Props principales :** `flows[], thicknessScale, direction`
- **Variantes :** migration | money | goods | traffic

### `MapChoropleth` — P1 — Core

- **Rôle :** Color geographic regions by value.
- **Props principales :** `regions[], values[], scale, legend`
- **Variantes :** quantile | linear | categorical

### `MapHeatmap` — P1 — Extended

- **Rôle :** Spatial concentration visualization.
- **Props principales :** `points[], weights[], radius, legend`
- **Variantes :** density | intensity

### `MapBoundaryChange` — P1 — Core

- **Rôle :** Animate borders or territorial change across dates.
- **Props principales :** `geometriesByTime, dates[], labels`
- **Variantes :** morph | step

### `MapInset` — P1 — Core

- **Rôle :** Small locator map inside another scene.
- **Props principales :** `bounds, target, position`
- **Variantes :** country | city

### `MapScaleLegend` — P2 — Extended

- **Rôle :** Reusable map scale, legend and north indicator.
- **Props principales :** `scale, legendItems[], units`
- **Variantes :** minimal | detailed

### `GeoPhotoPin` — P1 — Core

- **Rôle :** Place a photo or archival image at a geographic location.
- **Props principales :** `point, image, label, connector`
- **Variantes :** pin | callout


## 07 — Charts & Data

### `LineChartAnimated` — P0 — Core

- **Rôle :** Animate a time-series line and reveal points with narration.
- **Props principales :** `data, x, y, axes, annotations[]`
- **Variantes :** single | multi-series
- **Base de recherche :** https://arxiv.org/abs/2206.12118

### `BarChartAnimated` — P0 — Core

- **Rôle :** Animate ranked or categorical bars.
- **Props principales :** `data, category, value, orientation, highlight`
- **Variantes :** vertical | horizontal | racing
- **Base de recherche :** https://arxiv.org/abs/2206.12118

### `StackedBarChart` — P1 — Core

- **Rôle :** Show composition within totals.
- **Props principales :** `series[], categories[], normalize`
- **Variantes :** absolute | 100%

### `AreaChartAnimated` — P1 — Core

- **Rôle :** Show accumulated magnitude over time.
- **Props principales :** `data, x, y, baseline`
- **Variantes :** single | stacked

### `ScatterPlotAnimated` — P1 — Core

- **Rôle :** Reveal relationship/outliers between two variables.
- **Props principales :** `data, x, y, size, color, labels`
- **Variantes :** scatter | bubble

### `DotPlot` — P1 — Core

- **Rôle :** Simple distribution/ranking with minimal ink.
- **Props principales :** `data, category, value, highlight`
- **Variantes :** single | paired

### `SlopeChart` — P1 — Core

- **Rôle :** Compare values between two points in time.
- **Props principales :** `items[], start, end, labels`
- **Variantes :** ranked | highlighted

### `Histogram` — P2 — Extended

- **Rôle :** Show distribution of numeric values.
- **Props principales :** `values, bins, highlightRange`
- **Variantes :** static | animated bins

### `SmallMultiples` — P1 — Core

- **Rôle :** Repeat the same chart for regions/groups.
- **Props principales :** `panels[], sharedScale, columns`
- **Variantes :** line | bar | map

### `TableReveal` — P1 — Core

- **Rôle :** Reveal a data table row/column by row/column.
- **Props principales :** `headers, rows, highlightCells[], timing`
- **Variantes :** clean | report

### `RankingList` — P1 — Core

- **Rôle :** Animated rank list with changing positions.
- **Props principales :** `items[], valuesByTime, focus`
- **Variantes :** static | race

### `ProportionGrid` — P1 — Core

- **Rôle :** Represent percentages using 10x10 or icon grids.
- **Props principales :** `value, total, icon, label`
- **Variantes :** squares | people | dots

### `PictogramChart` — P2 — Extended

- **Rôle :** Use repeated icons for intuitive quantities.
- **Props principales :** `count, icon, perIcon, label`
- **Variantes :** people | buildings | objects

### `DonutChart` — P2 — Extended

- **Rôle :** Compact part-to-whole chart for simple splits.
- **Props principales :** `segments[], labels, centerText`
- **Variantes :** donut | ring

### `WaterfallChart` — P2 — Extended

- **Rôle :** Explain cumulative positive/negative contributions.
- **Props principales :** `steps[], values[], total`
- **Variantes :** financial | causal

### `SankeyFlow` — P2 — Extended

- **Rôle :** Show flows between categories.
- **Props principales :** `nodes[], links[], labels`
- **Variantes :** energy | money | process

### `ChartAnnotationLayer` — P0 — Core

- **Rôle :** Common arrows, callouts, shaded bands and labels over charts.
- **Props principales :** `annotations[], timing, collisionMode`
- **Variantes :** arrow | band | circle | text

### `ChartFocusTransition` — P0 — Core

- **Rôle :** Fade contextual data and focus one series/point.
- **Props principales :** `target, dimOpacity, zoom`
- **Variantes :** series | point | range


## 08 — Timelines

### `HorizontalTimeline` — P0 — Core

- **Rôle :** Chronological events with animated traversal.
- **Props principales :** `events[], startDate, endDate, focus`
- **Variantes :** linear | segmented
- **Base de recherche :** https://arxiv.org/abs/2206.12118

### `VerticalTimeline` — P1 — Core

- **Rôle :** Longer event list optimized for portrait/scroll feel.
- **Props principales :** `events[], spacing, focus`
- **Variantes :** clean | archival

### `DateCounter` — P1 — Core

- **Rôle :** Fast year/date stepping for historical transitions.
- **Props principales :** `from, to, step, suffix`
- **Variantes :** year | date | decade

### `EraBand` — P1 — Core

- **Rôle :** Colored period bands behind a timeline.
- **Props principales :** `eras[], labels, colors`
- **Variantes :** single | multi-lane

### `ParallelTimelines` — P1 — Core

- **Rôle :** Compare events in two places/groups simultaneously.
- **Props principales :** `lanes[], events[], sync`
- **Variantes :** 2-lane | multi-lane

### `TimelineZoom` — P1 — Core

- **Rôle :** Zoom from centuries/decades to days/minutes.
- **Props principales :** `ranges[], focusRange, duration`
- **Variantes :** continuous | stepped

### `EventCard` — P0 — Core

- **Rôle :** Reusable event marker with date, label and optional asset.
- **Props principales :** `date, title, description, asset`
- **Variantes :** compact | expanded


## 09 — Diagrams

### `ProcessFlow` — P0 — Core

- **Rôle :** Explain sequential steps with arrows and progressive reveal.
- **Props principales :** `steps[], connectors, activeStep`
- **Variantes :** horizontal | vertical | circular

### `CauseEffectChain` — P0 — Core

- **Rôle :** Show causal links with explicit direction.
- **Props principales :** `nodes[], edges[], evidence[]`
- **Variantes :** linear | branching

### `SystemDiagram` — P1 — Core

- **Rôle :** Boxes and connections explaining a system.
- **Props principales :** `nodes[], edges[], groups[], labels`
- **Variantes :** architecture | institutional | economic

### `NetworkGraph` — P1 — Core

- **Rôle :** Relationships between people, entities or institutions.
- **Props principales :** `nodes[], edges[], communities, focus`
- **Variantes :** force | fixed-layout

### `HierarchyTree` — P1 — Core

- **Rôle :** Organizational, taxonomic or power hierarchy.
- **Props principales :** `nodes, parentKey, levels`
- **Variantes :** top-down | radial

### `FunnelDiagram` — P2 — Extended

- **Rôle :** Stages with attrition or filtering.
- **Props principales :** `stages[], values[], labels`
- **Variantes :** funnel | stepped

### `CycleDiagram` — P2 — Extended

- **Rôle :** Circular recurrent process.
- **Props principales :** `steps[], active, direction`
- **Variantes :** 3–8 steps

### `InputOutputDiagram` — P1 — Core

- **Rôle :** Explain what goes into and comes out of a process.
- **Props principales :** `inputs[], process, outputs[]`
- **Variantes :** single | multi-stage

### `ExplodedObject` — P2 — Extended

- **Rôle :** Break an object/system into labeled parts.
- **Props principales :** `layers[], labels[], offsets[]`
- **Variantes :** mechanical | conceptual

### `ScaleComparison` — P1 — Core

- **Rôle :** Show relative size/quantity with scaled silhouettes.
- **Props principales :** `items[], values[], unit, reference`
- **Variantes :** linear | area-scaled

### `SpatialCrossSection` — P2 — Extended

- **Rôle :** Simplified cross-section of building, earth, device, etc.
- **Props principales :** `layers[], labels[], revealOrder`
- **Variantes :** static | animated

### `ConceptMetaphor` — P2 — Extended

- **Rôle :** Reusable visual metaphor scene (pipeline, bottleneck, balance).
- **Props principales :** `metaphorType, labels[], values[]`
- **Variantes :** pipeline | balance | barrier | bridge


## 10 — Numbers & Stats

### `BigStat` — P0 — Core

- **Rôle :** Large number + concise explanatory label.
- **Props principales :** `value, prefix, suffix, label, source`
- **Variantes :** full-screen | overlay

### `StatComparison` — P0 — Core

- **Rôle :** Compare two or more numbers with visual emphasis.
- **Props principales :** `items[], values[], unit, highlight`
- **Variantes :** side-by-side | stacked

### `PercentRing` — P2 — Extended

- **Rôle :** Quick percentage display.
- **Props principales :** `value, label, source`
- **Variantes :** ring | arc

### `RatioVisualizer` — P1 — Core

- **Rôle :** Explain ratios such as 1 in 5.
- **Props principales :** `numerator, denominator, icon, label`
- **Variantes :** grid | people-row

### `UnitScale` — P1 — Core

- **Rôle :** Convert abstract values into intuitive reference units.
- **Props principales :** `value, unit, comparisons[]`
- **Variantes :** distance | money | time | area

### `CounterfactualStat` — P1 — Core

- **Rôle :** Show actual vs hypothetical value.
- **Props principales :** `actual, hypothetical, labels, source`
- **Variantes :** delta | ghost-bar

### `DeltaBadge` — P1 — Core

- **Rôle :** Compact increase/decrease indicator.
- **Props principales :** `value, direction, unit, period`
- **Variantes :** absolute | percent

### `UncertaintyRange` — P1 — Core

- **Rôle :** Represent confidence intervals or ranges.
- **Props principales :** `low, high, center, label`
- **Variantes :** bar | band | interval


## 11 — Comparisons

### `A_vs_B` — P0 — Core

- **Rôle :** Direct visual comparison of two cases.
- **Props principales :** `a, b, dimensions[], highlight`
- **Variantes :** split | cards | table

### `ThenVsNow` — P0 — Core

- **Rôle :** Historic vs current comparison.
- **Props principales :** `then, now, dates, assets`
- **Variantes :** photo | map | data

### `ExpectedVsActual` — P1 — Core

- **Rôle :** Contrast expectation/model with observed reality.
- **Props principales :** `expected, actual, metric, explanation`
- **Variantes :** chart | number | split

### `ProsConsMatrix` — P2 — Extended

- **Rôle :** Structured tradeoff scene.
- **Props principales :** `criteria[], options[], values`
- **Variantes :** 2-col | matrix

### `ScenarioComparison` — P2 — Extended

- **Rôle :** Compare multiple future/past scenarios.
- **Props principales :** `scenarios[], metrics[], selected`
- **Variantes :** cards | chart

### `MythVsFact` — P1 — Core

- **Rôle :** Contrast common claim with evidence.
- **Props principales :** `myth, fact, sources[]`
- **Variantes :** flip | split

### `ClaimEvidencePair` — P0 — Core

- **Rôle :** One claim paired with supporting/contradicting evidence.
- **Props principales :** `claim, evidence, relation, source`
- **Variantes :** support | contradict


## 12 — Quotes & Interviews

### `QuoteCard` — P0 — Core

- **Rôle :** Editorial quotation with attribution.
- **Props principales :** `quote, speaker, role, source`
- **Variantes :** full | side

### `AudioQuoteWaveform` — P1 — Core

- **Rôle :** Play an audio quote with waveform and transcript.
- **Props principales :** `audio, transcript, speaker, waveform`
- **Variantes :** full | lower-third

### `InterviewFrame` — P0 — Core

- **Rôle :** Framing for interview footage with metadata.
- **Props principales :** `video, speaker, role, crop, caption`
- **Variantes :** full | picture-in-picture
- **Base de recherche :** https://www.pressclubinstitute.org/2026/07/21/vox-video-producer-nate-krieger-on-how-to-create-engaging-visual-journalism/

### `PullQuoteOverlay` — P1 — Core

- **Rôle :** Short pull quote placed over footage/photo.
- **Props principales :** `quote, attribution, position`
- **Variantes :** light | dark

### `MultiSpeakerSequence` — P1 — Core

- **Rôle :** Rapid alternation among multiple interviewees.
- **Props principales :** `clips[], names[], pacing`
- **Variantes :** cuts | grid

### `TranscriptHighlight` — P1 — Core

- **Rôle :** Highlight spoken words in sync with audio.
- **Props principales :** `words[], timestamps[], style`
- **Variantes :** karaoke | sentence


## 13 — Citations & Provenance

### `SourceFooter` — P0 — Core

- **Rôle :** Persistent source line at bottom of screen.
- **Props principales :** `source, date, url, page`
- **Variantes :** single | multiple

### `CitationStack` — P0 — Core

- **Rôle :** Stack 2–5 citations when several sources support a claim.
- **Props principales :** `citations[], maxVisible`
- **Variantes :** compact | expanded

### `FootnoteMarker` — P1 — Core

- **Rôle :** Small numbered marker linked to a source registry.
- **Props principales :** `index, position, style`
- **Variantes :** superscript | badge

### `SourceDrawer` — P1 — Core

- **Rôle :** Animated side drawer exposing detailed provenance.
- **Props principales :** `claim, citations[], excerpts[]`
- **Variantes :** left | right

### `LicenseCredit` — P0 — Core

- **Rôle :** Asset license/creator attribution.
- **Props principales :** `creator, license, source, assetId`
- **Variantes :** compact | end-credit

### `MethodologyCard` — P1 — Core

- **Rôle :** Brief explanation of dataset/method used.
- **Props principales :** `method, sample, caveats[], source`
- **Variantes :** compact | full

### `DataFreshnessBadge` — P1 — Core

- **Rôle :** Show how current the data is.
- **Props principales :** `asOf, retrievedAt, status`
- **Variantes :** fresh | stale | archival


## 14 — Editorial Collage

### `PaperCutout` — P1 — Core

- **Rôle :** Torn/cut paper shape for editorial collage.
- **Props principales :** `shape, texture, rotation, shadow`
- **Variantes :** torn | clean-cut

### `TapeStrip` — P2 — Extended

- **Rôle :** Decorative tape holding a photo/document.
- **Props principales :** `position, rotation, texture, opacity`
- **Variantes :** masking | paper

### `MarkerStroke` — P1 — Core

- **Rôle :** Hand-drawn underline, circle or arrow.
- **Props principales :** `path, width, jitter, timing`
- **Variantes :** underline | circle | arrow

### `StickerLabel` — P2 — Extended

- **Rôle :** Small editorial sticker for categories or dates.
- **Props principales :** `text, shape, rotation`
- **Variantes :** rect | circle | torn

### `PaperCard` — P1 — Core

- **Rôle :** Card with tactile paper treatment.
- **Props principales :** `content, texture, edge, shadow`
- **Variantes :** note | quote | stat

### `CutoutMontage` — P1 — Core

- **Rôle :** Layer multiple cutout photos/objects into a scene.
- **Props principales :** `assets[], positions[], depths[]`
- **Variantes :** static | parallax

### `HalftoneImage` — P2 — Extended

- **Rôle :** Apply print-like halftone treatment.
- **Props principales :** `src, dotSize, contrast, tint`
- **Variantes :** mono | duotone

### `NewspaperTexture` — P2 — Extended

- **Rôle :** Newsprint background or clipping texture.
- **Props principales :** `texture, grain, opacity`
- **Variantes :** light | aged

### `HandDrawnDoodle` — P2 — Extended

- **Rôle :** Small illustrative doodle used to explain/emphasize.
- **Props principales :** `svg, drawProgress, label`
- **Variantes :** arrow | icon | sketch


## 15 — Motion & Camera

### `PushIn` — P0 — Core

- **Rôle :** Reusable smooth push-in on any scene/container.
- **Props principales :** `fromScale, toScale, anchor, easing`
- **Variantes :** subtle | dramatic

### `Pan` — P0 — Core

- **Rôle :** Horizontal/vertical camera movement.
- **Props principales :** `from, to, easing, duration`
- **Variantes :** x | y | diagonal

### `ParallaxStack` — P1 — Core

- **Rôle :** Depth-separated motion for collage/images.
- **Props principales :** `layers[], depth[], cameraMotion`
- **Variantes :** 2D | faux-3D

### `FocusRack2D` — P1 — Core

- **Rôle :** Dim/blur background while focusing a detail.
- **Props principales :** `target, blur, dim, duration`
- **Variantes :** single | sequential

### `ObjectTrack` — P1 — Core

- **Rôle :** Attach label/callout to a moving object.
- **Props principales :** `targetPath, label, offset`
- **Variantes :** point | box | line

### `SpringEntrance` — P1 — Extended

- **Rôle :** Standardized spring entrance for UI-like elements.
- **Props principales :** `from, to, damping, stiffness, delay`
- **Variantes :** scale | slide

### `SteppedPaperMotion` — P2 — Extended

- **Rôle :** Low-frame-rate/jitter treatment for tactile collage.
- **Props principales :** `fps, jitter, seed, intensity`
- **Variantes :** 12fps | 15fps | custom
- **Base de recherche :** https://arxiv.org/abs/2309.14642

### `MotionPath` — P1 — Core

- **Rôle :** Move an icon/object along a defined path.
- **Props principales :** `path, progress, orient, trail`
- **Variantes :** linear | curved

### `DrawOn` — P0 — Core

- **Rôle :** Animate SVG/path strokes.
- **Props principales :** `path, duration, easing, reverse`
- **Variantes :** line | arrow | boundary

### `MaskReveal` — P1 — Core

- **Rôle :** Reveal content through a moving shape/mask.
- **Props principales :** `mask, direction, feather, duration`
- **Variantes :** wipe | iris | custom


## 16 — Transitions

### `HardCut` — none — P0

- **Rôle :** Explicit cut marker for deterministic sequencing.
- **Props principales :** `atFrame`
- **Variantes :** audioJCut
- **Notes :** Core

### `CrossDissolve` — P1 — Core

- **Rôle :** Soft transition between related visuals.
- **Props principales :** `duration, curve`
- **Variantes :** linear | eased

### `MatchCut` — P1 — Core

- **Rôle :** Transition using matched shape/position between scenes.
- **Props principales :** `sourceAnchor, targetAnchor, duration`
- **Variantes :** object | map | chart

### `WhipPan` — P2 — Extended

- **Rôle :** Fast directional transition for energetic sequences.
- **Props principales :** `direction, blur, duration`
- **Variantes :** left | right | up | down

### `PaperWipe` — P2 — Extended

- **Rôle :** Torn-paper or card wipe between scenes.
- **Props principales :** `edge, texture, direction, duration`
- **Variantes :** torn | clean

### `ShapeMorph` — P2 — Extended

- **Rôle :** Morph one simple SVG shape into another.
- **Props principales :** `fromPath, toPath, duration`
- **Variantes :** circle-map | icon-chart

### `ZoomThrough` — P1 — Core

- **Rôle :** Zoom into an object and emerge into the next scene.
- **Props principales :** `portalRect, scale, duration`
- **Variantes :** photo | map | document

### `DataMorph` — P2 — Extended

- **Rôle :** Morph one data visualization into another.
- **Props principales :** `fromSpec, toSpec, keyMap, duration`
- **Variantes :** bar-line | map-chart | rank


## 17 — Video & B-roll

### `BrollClip` — P0 — Core

- **Rôle :** Standardized b-roll wrapper with crop, speed and attribution.
- **Props principales :** `src, in, out, playbackRate, crop, credit`
- **Variantes :** original | licensed | generated
- **Base de recherche :** https://www.pressclubinstitute.org/2026/07/21/vox-video-producer-nate-krieger-on-how-to-create-engaging-visual-journalism/

### `BrollMontage` — P1 — Core

- **Rôle :** Sequence of short clips timed to narration/music.
- **Props principales :** `clips[], beats[], transitions[]`
- **Variantes :** fast | reflective

### `PictureInPicture` — P1 — Core

- **Rôle :** Video or source window over another scene.
- **Props principales :** `primary, secondary, rect, border`
- **Variantes :** corner | floating-card

### `FreezeFrameAnnotate` — P0 — Core

- **Rôle :** Freeze footage and add labels/arrows.
- **Props principales :** `video, freezeAt, annotations[], hold`
- **Variantes :** single | multi-step

### `SpeedRamp` — P2 — Extended

- **Rôle :** Controlled speed-up/slow-down around a moment.
- **Props principales :** `src, segments[], easing`
- **Variantes :** ramp | freeze-ramp

### `LoopingBackgroundVideo` — P2 — Extended

- **Rôle :** Subtle looping footage under text/data.
- **Props principales :** `src, loopStart, loopEnd, dim, blur`
- **Variantes :** ambient | abstract

### `GeneratedShotFrame` — P0 — Core

- **Rôle :** Wrapper for Veo/Omni footage with provenance metadata.
- **Props principales :** `src, model, promptId, credit, disclaimer`
- **Variantes :** Veo | Omni

### `ReenactmentLabel` — P0 — Core

- **Rôle :** Clearly label AI/illustrative reconstructions.
- **Props principales :** `label, method, persistent`
- **Variantes :** AI-generated | reconstruction | illustration


## 18 — Audio-Linked

### `Waveform` — P2 — Extended

- **Rôle :** Audio waveform component.
- **Props principales :** `audio, samples, style, progress`
- **Variantes :** line | bars

### `AudioSpectrum` — P3 — Extended

- **Rôle :** Frequency visualization for music/sound segments.
- **Props principales :** `audio, bands, smoothing, scale`
- **Variantes :** bars | radial

### `BeatMarker` — P1 — Extended

- **Rôle :** Expose beat/timing events to scene animations.
- **Props principales :** `beats[], offset, strength`
- **Variantes :** music | narration-emphasis

### `NarrationProgress` — P0 — Core

- **Rôle :** Progress signal for syncing visual reveals to voiceover.
- **Props principales :** `wordTimings[], sentenceTimings[]`
- **Variantes :** word | sentence

### `SoundCueMarker` — P1 — Extended

- **Rôle :** Declarative cue for whoosh, click, paper, impact, etc.
- **Props principales :** `cue, at, gain, pan`
- **Variantes :** ui | editorial | cinematic


## 19 — Captions & Accessibility

### `SubtitleTrack` — P0 — Core

- **Rôle :** Standard subtitle rendering from word/sentence timestamps.
- **Props principales :** `captions[], language, maxLines, safeArea`
- **Variantes :** sentence | phrase | word

### `EmphasisSubtitles` — P1 — Core

- **Rôle :** Subtitle style emphasizing selected spoken words.
- **Props principales :** `captions[], emphasis[], style`
- **Variantes :** bold | color | scale

### `SpeakerCaption` — P1 — Core

- **Rôle :** Subtitle with speaker identity for interviews.
- **Props principales :** `speaker, text, timestamps`
- **Variantes :** name-tag | color-tag

### `TranslationCaption` — P2 — Extended

- **Rôle :** Secondary-language captions.
- **Props principales :** `primary, translation, layout`
- **Variantes :** stacked | toggle-output

### `AudioDescriptionCard` — P3 — Extended

- **Rôle :** Optional textual/audio-description cue for accessibility.
- **Props principales :** `description, timing`
- **Variantes :** metadata | visible

### `ReadabilityBackdrop` — P0 — Core

- **Rôle :** Adaptive backdrop behind text on busy imagery.
- **Props principales :** `target, opacity, blur, gradient`
- **Variantes :** box | gradient | vignette


## 20 — Branding & Output

### `BrandBug` — P2 — Extended

- **Rôle :** Small persistent publication/series mark.
- **Props principales :** `logo, position, opacity, safeArea`
- **Variantes :** always | chapter-only

### `SeriesIntro` — P2 — Extended

- **Rôle :** Short reusable series ident.
- **Props principales :** `logo, title, motif, duration`
- **Variantes :** 2s | 4s | 6s

### `CreditsRoll` — P1 — Core

- **Rôle :** Scrollable or card-based end credits.
- **Props principales :** `sections[], speed, logos[]`
- **Variantes :** roll | cards

### `SourceCreditsRoll` — P0 — Core

- **Rôle :** Dedicated bibliography/source credits.
- **Props principales :** `sources[], grouping, qrOrUrl`
- **Variantes :** compact | full

### `AspectRatioAdapter` — P0 — Core

- **Rôle :** Per-shot crop/re-layout strategy for 16:9, 9:16, 1:1.
- **Props principales :** `targetRatio, rules, focalPoint`
- **Variantes :** crop | reflow

### `ThumbnailFrame` — P2 — Extended

- **Rôle :** Generate candidate thumbnail from composition data.
- **Props principales :** `headline, heroAsset, badge, crop`
- **Variantes :** YouTube | social

### `SocialCutdownFrame` — P2 — Extended

- **Rôle :** Recompose a scene for short vertical derivatives.
- **Props principales :** `scene, cropRules, headline, captions`
- **Variantes :** 9:16 | 1:1

### `RenderDiagnostics` — P0 — Infrastructure

- **Rôle :** Debug overlay for frame, component, timing and source IDs.
- **Props principales :** `show, frame, componentId, sceneId`
- **Variantes :** dev-only

### `AssetFallback` — P0 — Infrastructure

- **Rôle :** Graceful fallback when an image/video/source is unavailable.
- **Props principales :** `fallbackType, message, placeholder`
- **Variantes :** neutral | branded

### `SceneErrorBoundary` — P0 — Infrastructure

- **Rôle :** Prevent one malformed agent-generated scene from breaking the render.
- **Props principales :** `sceneId, fallback, log`
- **Variantes :** dev | production


## 21 — Agent Control

### `SceneRegistry` — P0 — Infrastructure

- **Rôle :** Registry mapping allowed component names to schemas and renderers.
- **Props principales :** `componentMap, schemas, version`
- **Variantes :** strict | compatibility

### `SceneSchemaValidator` — P0 — Infrastructure

- **Rôle :** Validate Gemini output before rendering.
- **Props principales :** `schema, payload, defaults, errors`
- **Variantes :** strict | repairable

### `DesignTokenProvider` — P0 — Infrastructure

- **Rôle :** Centralize typography, spacing, colors, motion and texture tokens.
- **Props principales :** `theme, fonts, palette, easing, spacing`
- **Variantes :** light | dark | paper

### `MotionPresetProvider` — P0 — Infrastructure

- **Rôle :** Named reusable motion presets Gemini can reference safely.
- **Props principales :** `presets, durations, easing`
- **Variantes :** subtle | energetic | archival

### `SourceRegistry` — P0 — Infrastructure

- **Rôle :** Central source ID → citation metadata mapping.
- **Props principales :** `sources[], idStrategy`
- **Variantes :** document | web | data | asset

### `AssetRegistry` — P0 — Infrastructure

- **Rôle :** Central media ID → local/remote asset metadata mapping.
- **Props principales :** `assets[], type, license, focalPoint`
- **Variantes :** image | video | audio | svg

### `SceneAssembler` — P0 — Infrastructure

- **Rôle :** Compose a list of validated scenes into a timeline.
- **Props principales :** `scenes[], transitions[], audio`
- **Variantes :** linear | chaptered

### `NarrationSyncEngine` — P0 — Infrastructure

- **Rôle :** Map script timestamps to visual beats and component events.
- **Props principales :** `segments[], words[], cues[]`
- **Variantes :** sentence | word

### `DurationResolver` — P0 — Infrastructure

- **Rôle :** Resolve scene length from narration, minimums and animation constraints.
- **Props principales :** `voiceDuration, min, max, padding`
- **Variantes :** auto | fixed

### `CollisionResolver` — P1 — Infrastructure

- **Rôle :** Prevent labels/callouts from overlapping in maps/charts.
- **Props principales :** `items[], bounds, priorities`
- **Variantes :** greedy | force | hide-low-priority

### `EditorialRuleChecker` — P0 — Infrastructure

- **Rôle :** Check density, source presence, line length, pacing and disclosure rules.
- **Props principales :** `scene, ruleset, severity`
- **Variantes :** warn | block


## Légende de priorité

- **P0** : fondation / indispensable au MVP
- **P1** : essentiel pour la richesse d'un vrai explainer
- **P2** : avancé / amélioration visuelle
- **P3** : optionnel