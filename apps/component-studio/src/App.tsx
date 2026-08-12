/**
 * Component Studio.
 *
 * The evaluation loop the quality grid needs, and the thing Remotion Studio cannot do:
 * every capability × every layout × every motion profile, side by side, plus a six-frame
 * filmstrip per variant. Without this there is no way to see that a token change broke
 * three scenes.
 *
 * This is an internal tool, not the product UI. It uses React state freely — the purity
 * rule applies to what Remotion renders, not to the harness around it.
 */
import { Player, Thumbnail } from '@remotion/player';
import {
  ExampleScene,
  FPS,
  HEIGHT,
  type MotionProfileId,
  type SceneCapability,
  type Slot,
  WIDTH,
  defaultTheme,
  motionProfileIds,
  registry,
  slotRect,
} from '@vox/video';
import { useMemo, useState } from 'react';

type Mode = 'grid' | 'filmstrip' | 'matrix';

const FILMSTRIP_POSITIONS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const t = defaultTheme;

/**
 * The harness standing in for the compiler: pick a composition, hand the scene the
 * rectangle that follows.
 *
 * It refuses to compose a capability into a slot that capability does not declare, which
 * is not a convenience — it is ADR-0003 decision 1 applied to the tool. An undeclared
 * carve is a frame nobody designed, and a grid that renders one teaches whoever is
 * reviewing it that the frame exists. `undefined` means the whole canvas, which is what
 * an example gets when nothing contends with it.
 */
const safeAreaFor = (capability: SceneCapability, composition: string) =>
  composition && capability.meta.supportedCompositions.includes(composition as Slot)
    ? slotRect(composition as Slot)
    : undefined;

export const App = () => {
  const flat = useMemo(
    () =>
      registry.flatMap((capability) =>
        capability.examples.map((example) => ({ capability, example })),
      ),
    [],
  );

  const [selectedId, setSelectedId] = useState(flat[0] ? flat[0].example.id : '');
  const [mode, setMode] = useState<Mode>('grid');
  const [layoutOverride, setLayoutOverride] = useState<string>('');
  const [profileOverride, setProfileOverride] = useState<string>('');
  const [compositionOverride, setCompositionOverride] = useState<string>('');

  /**
   * Every composition any capability declares, not just the selected one's: in grid mode
   * the whole catalog is on screen, and the point of picking `left` there is to see which
   * capabilities can take it and what each one does with it.
   */
  const compositions = useMemo(
    () => [...new Set(registry.flatMap((c) => c.meta.supportedCompositions))],
    [],
  );

  const selected = flat.find((f) => f.example.id === selectedId) ?? flat[0];

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          Vox Studio
          <span style={styles.brandSub}>Component Studio</span>
        </div>

        {registry.map((capability) => (
          <div key={capability.meta.id} style={{ marginBottom: 28 }}>
            <div style={styles.capabilityName}>
              {capability.meta.name}
              <span style={styles.capabilityId}>{capability.meta.id}</span>
            </div>
            {capability.examples.map((example) => (
              <button
                type="button"
                key={example.id}
                onClick={() => setSelectedId(example.id)}
                style={{
                  ...styles.exampleButton,
                  ...(example.id === selectedId ? styles.exampleButtonActive : null),
                }}
              >
                <div style={{ fontWeight: 600 }}>{example.title}</div>
                <div style={styles.exampleNote}>{example.note}</div>
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main style={styles.main}>
        <header style={styles.toolbar}>
          <div style={styles.segmented}>
            {(['grid', 'filmstrip', 'matrix'] as Mode[]).map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setMode(m)}
                style={{ ...styles.segment, ...(mode === m ? styles.segmentActive : null) }}
              >
                {m}
              </button>
            ))}
          </div>

          <div style={styles.controls}>
            <Select
              label="layout"
              value={layoutOverride}
              onChange={setLayoutOverride}
              options={selected ? ['', ...Object.keys(selected.capability.layouts)] : ['']}
            />
            <Select
              label="motion"
              value={profileOverride}
              onChange={setProfileOverride}
              options={['', ...motionProfileIds]}
            />
            <Select
              label="composition"
              value={compositionOverride}
              onChange={setCompositionOverride}
              options={['', ...compositions]}
              emptyLabel="whole frame"
            />
          </div>
        </header>

        {mode === 'grid' ? (
          <div style={styles.grid}>
            {flat.map(({ capability, example }) => (
              <figure key={example.id} style={styles.card}>
                <Player
                  component={ExampleScene}
                  inputProps={{
                    capabilityId: capability.meta.id,
                    exampleId: example.id,
                    layout: layoutOverride || null,
                    motionProfile: (profileOverride as MotionProfileId) || null,
                    safeArea: safeAreaFor(capability, compositionOverride),
                  }}
                  durationInFrames={capability.meta.recommendedDurationFrames}
                  fps={FPS}
                  compositionWidth={WIDTH}
                  compositionHeight={HEIGHT}
                  style={{ width: '100%', aspectRatio: '16 / 9' }}
                  controls
                  loop
                  autoPlay
                />
                <figcaption style={styles.caption}>
                  <strong>{example.title}</strong>
                  <span style={styles.captionMeta}>
                    {example.layout} · {example.motionProfile}
                    {compositionOverride
                      ? ` · ${
                          safeAreaFor(capability, compositionOverride)
                            ? compositionOverride
                            : `no ${compositionOverride}`
                        }`
                      : ''}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}

        {mode === 'filmstrip' && selected ? (
          <section>
            <h2 style={styles.heading}>{selected.example.title}</h2>
            <p style={styles.subheading}>
              Six frames across the scene. Read them against the grid: one dominant element,
              generous margins, coherent offsets, 3:1 type contrast, no colour outside the tokens.
            </p>
            <div style={styles.filmstrip}>
              {FILMSTRIP_POSITIONS.map((position) => {
                const duration = selected.capability.meta.recommendedDurationFrames;
                const frame = Math.min(duration - 1, Math.round((duration - 1) * position));
                return (
                  <figure key={position} style={styles.frameCard}>
                    <Thumbnail
                      component={ExampleScene}
                      inputProps={{
                        capabilityId: selected.capability.meta.id,
                        exampleId: selected.example.id,
                        layout: layoutOverride || null,
                        motionProfile: (profileOverride as MotionProfileId) || null,
                        safeArea: safeAreaFor(selected.capability, compositionOverride),
                      }}
                      durationInFrames={duration}
                      frameToDisplay={frame}
                      fps={FPS}
                      compositionWidth={WIDTH}
                      compositionHeight={HEIGHT}
                      style={{ width: '100%', aspectRatio: '16 / 9' }}
                    />
                    <figcaption style={styles.caption}>
                      {Math.round(position * 100)}% · frame {frame}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        ) : null}

        {mode === 'matrix' && selected ? (
          <section>
            <h2 style={styles.heading}>
              {selected.example.title} — every layout × every motion profile
            </h2>
            <p style={styles.subheading}>
              Sampled at 60% of the scene. This is the view that catches a layout nobody looked at
              since the token change.
            </p>
            {Object.keys(selected.capability.layouts).map((layoutId) => (
              <div key={layoutId} style={{ marginBottom: 40 }}>
                <div style={styles.rowLabel}>{layoutId}</div>
                <div style={styles.matrixRow}>
                  {motionProfileIds.map((profileId) => {
                    const duration = selected.capability.meta.recommendedDurationFrames;
                    return (
                      <figure key={profileId} style={styles.frameCard}>
                        <Thumbnail
                          component={ExampleScene}
                          inputProps={{
                            capabilityId: selected.capability.meta.id,
                            exampleId: selected.example.id,
                            layout: layoutId,
                            motionProfile: profileId,
                            safeArea: safeAreaFor(selected.capability, compositionOverride),
                          }}
                          durationInFrames={duration}
                          frameToDisplay={Math.round(duration * 0.6)}
                          fps={FPS}
                          compositionWidth={WIDTH}
                          compositionHeight={HEIGHT}
                          style={{ width: '100%', aspectRatio: '16 / 9' }}
                        />
                        <figcaption style={styles.caption}>{profileId}</figcaption>
                      </figure>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
};

const Select = ({
  label,
  value,
  onChange,
  options,
  emptyLabel = 'from example',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  /** What the empty option means. A composition has no example to fall back to. */
  emptyLabel?: string;
}) => (
  <label style={styles.selectWrap}>
    <span style={styles.selectLabel}>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.select}>
      {options.map((option) => (
        <option key={option || 'default'} value={option}>
          {option || emptyLabel}
        </option>
      ))}
    </select>
  </label>
);

const styles = {
  shell: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    minHeight: '100vh',
    background: t.color.bg,
    color: t.color.ink,
    fontFamily: t.type.body,
  },
  sidebar: {
    borderRight: `1px solid ${t.color.surface}`,
    padding: 28,
    background: t.color.bg,
    position: 'sticky',
    top: 0,
    height: '100vh',
    overflowY: 'auto',
  },
  brand: {
    fontFamily: t.type.display,
    fontWeight: 800,
    fontSize: 22,
    letterSpacing: -0.4,
    marginBottom: 36,
    display: 'flex',
    flexDirection: 'column',
  },
  brandSub: {
    fontFamily: t.type.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: t.color.accent,
    marginTop: 6,
  },
  capabilityName: {
    fontFamily: t.type.display,
    fontSize: 14,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: t.color.inkMuted,
    marginBottom: 12,
    display: 'flex',
    justifyContent: 'space-between',
  },
  capabilityId: { fontFamily: t.type.mono, fontSize: 11, color: t.color.accent },
  exampleButton: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: `1px solid ${t.color.surface}`,
    borderRadius: 8,
    color: t.color.ink,
    padding: '10px 12px',
    marginBottom: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: t.type.body,
  },
  exampleButtonActive: { borderColor: t.color.accent, background: t.color.surface },
  exampleNote: { color: t.color.inkMuted, fontSize: 11, marginTop: 4, lineHeight: 1.4 },
  main: { padding: 32, minWidth: 0 },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
    gap: 24,
    flexWrap: 'wrap',
  },
  segmented: { display: 'flex', gap: 4, background: t.color.surface, padding: 4, borderRadius: 10 },
  segment: {
    background: 'transparent',
    border: 'none',
    color: t.color.inkMuted,
    padding: '8px 18px',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: t.type.body,
  },
  segmentActive: { background: t.color.accent, color: t.color.bg, fontWeight: 600 },
  controls: { display: 'flex', gap: 16 },
  selectWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  selectLabel: {
    fontFamily: t.type.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: t.color.inkMuted,
  },
  select: {
    background: t.color.surface,
    color: t.color.ink,
    border: `1px solid ${t.color.surface}`,
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 13,
    fontFamily: t.type.body,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 28 },
  filmstrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 20,
  },
  matrixRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
  },
  card: { margin: 0, background: t.color.surface, borderRadius: 12, overflow: 'hidden' },
  frameCard: { margin: 0, background: t.color.surface, borderRadius: 10, overflow: 'hidden' },
  caption: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 14px',
    fontSize: 12,
    color: t.color.inkMuted,
    fontFamily: t.type.mono,
  },
  captionMeta: { color: t.color.accent },
  heading: { fontFamily: t.type.display, fontSize: 26, fontWeight: 800, margin: '0 0 8px' },
  subheading: { color: t.color.inkMuted, fontSize: 14, maxWidth: 720, margin: '0 0 24px' },
  rowLabel: {
    fontFamily: t.type.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: t.color.accent,
    marginBottom: 12,
  },
} satisfies Record<string, React.CSSProperties>;
