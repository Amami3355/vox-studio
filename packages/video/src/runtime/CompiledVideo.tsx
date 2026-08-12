/**
 * The generic Section runtime.
 *
 * It decides nothing. There is no slot here, no fallback for a missing asset, no opinion
 * about what happens when two things overlap: every such question was answered by the
 * compiler and is already in the document. If this file ever needs an `if` about layout,
 * the compiler failed to decide something.
 *
 * Nesting is what makes the arithmetic disappear. A scene's `<Sequence>` reparents the
 * frame clock, so `SceneRenderer` sees frame 0 at its own start and
 * `useVideoConfig().durationInFrames` reports the scene's length rather than the video's.
 */
import type React from 'react';
import { AbsoluteFill, Img, Sequence } from 'remotion';
import type { CompiledDocument, CompiledSection, LayoutState } from '../compile/document';
import { type Theme, defaultTheme } from '../design/theme';
import { SceneRenderer } from './SceneRenderer';

export const CompiledVideo: React.FC<{
  document: CompiledDocument;
  theme?: Theme;
}> = ({ document, theme = defaultTheme }) => (
  <AbsoluteFill style={{ backgroundColor: theme.color.bg }}>
    {document.sections.map((section) => (
      <Sequence
        key={section.id}
        name={`section ${section.id}`}
        from={section.from}
        durationInFrames={section.to - section.from}
      >
        <CompiledSectionRuntime section={section} theme={theme} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

const CompiledSectionRuntime: React.FC<{ section: CompiledSection; theme: Theme }> = ({
  section,
  theme,
}) => (
  <>
    {section.scenes.map((scene) => (
      <Sequence
        key={scene.id}
        name={`scene ${scene.id}`}
        from={scene.from - section.from}
        durationInFrames={scene.to - scene.from}
      >
        <SceneRenderer
          capabilityId={scene.capabilityId}
          props={scene.props}
          assets={scene.assets}
          events={scene.events}
          layout={scene.layout}
          motionProfile={scene.motionProfile}
          safeArea={scene.safeArea}
          theme={theme}
        />
      </Sequence>
    ))}

    {/*
     * After the scenes, so a persistent element sits above them. It is persistent *within*
     * the section, which is the only scope the architecture gives it — a character that
     * outlived its section would have no placement to be resolved against.
     */}
    {section.layoutStates.map((state) => (
      <Sequence
        key={`${state.elementId}-${state.from}`}
        name={`persistent ${state.elementId}`}
        from={state.from - section.from}
        durationInFrames={state.to - state.from}
      >
        <PersistentElementLayer section={section} state={state} />
      </Sequence>
    ))}
  </>
);

const PersistentElementLayer: React.FC<{ section: CompiledSection; state: LayoutState }> = ({
  section,
  state,
}) => {
  const element = section.persistent.find((candidate) => candidate.id === state.elementId);

  /** No asset, nothing drawn. Inventing a stand-in here would be the runtime deciding. */
  if (!element?.asset) return null;

  return (
    <AbsoluteFill
      style={{
        top: `${state.rect.top}%`,
        right: `${state.rect.right}%`,
        bottom: `${state.rect.bottom}%`,
        left: `${state.rect.left}%`,
        width: 'auto',
        height: 'auto',
      }}
    >
      <Img
        src={element.asset.uri}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </AbsoluteFill>
  );
};
