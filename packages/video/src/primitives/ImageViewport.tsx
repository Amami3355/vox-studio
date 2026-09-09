import type React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { contentProgressAt } from '../design/motion';

export type ImageRegion = 'whole' | 'center' | 'top' | 'bottom' | 'left' | 'right';
export type ImageFocus = { frame: number; region: ImageRegion };
const framing = {
  whole: { scale: 1, x: 50, y: 50 },
  center: { scale: 1.65, x: 50, y: 50 },
  top: { scale: 1.65, x: 50, y: 0 },
  bottom: { scale: 1.65, x: 50, y: 100 },
  left: { scale: 1.65, x: 0, y: 50 },
  right: { scale: 1.65, x: 100, y: 50 },
} as const;

/** Sample interrupted reframing from its actual position, so closely spaced anchors never jump. */
export const imageFramingAt = (changes: ImageFocus[], frame: number) => {
  let from: { scale: number; x: number; y: number } = framing.whole;
  let target = from;
  let start = 0;
  const sample = (at: number) => {
    const t = contentProgressAt(at, start);
    return {
      scale: from.scale + (target.scale - from.scale) * t,
      x: from.x + (target.x - from.x) * t,
      y: from.y + (target.y - from.y) * t,
    };
  };
  for (const change of changes) {
    if (change.frame > frame) break;
    from = sample(change.frame);
    target = framing[change.region];
    start = change.frame;
  }
  return sample(frame);
};

/** The content is clipped inside its plate; this never changes the scene camera or safe area. */
export const ImageViewport: React.FC<{
  uri: string;
  changes: ImageFocus[];
  fit?: 'contain' | 'cover';
}> = ({ uri, changes, fit = 'contain' }) => {
  const value = imageFramingAt(changes, useCurrentFrame());
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Img
        src={/^[a-z][a-z0-9+.-]*:/i.test(uri) ? uri : staticFile(uri)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: fit,
          display: 'block',
          transform: `scale(${value.scale})`,
          transformOrigin: `${value.x}% ${value.y}%`,
        }}
      />
    </div>
  );
};
