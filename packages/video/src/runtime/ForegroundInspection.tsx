/** Test/studio inspection only. Images and their scrims may touch the frame edge;
 * text must not. Visibility preserves the exact layout and all DOM fit measurements.
 * Normal film rendering never mounts this helper. */
export const ForegroundInspection = ({
  enabled,
  background,
}: { enabled?: boolean; background?: boolean }) =>
  enabled ? (
    <style>{'[data-scene-bleed] { visibility: hidden !important; }'}</style>
  ) : background ? (
    <style>{'[data-scene-foreground] { visibility: hidden !important; }'}</style>
  ) : null;
