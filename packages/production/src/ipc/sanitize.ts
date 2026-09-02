/**
 * A host-local path, in the three shapes a boundary response can carry it:
 *
 * - a `file:` URI, whatever follows the scheme;
 * - a Windows path behind a drive letter, which is the local topology's shape;
 * - an absolute POSIX path of two or more segments, which is the container's.
 *
 * **Only the third alternative is new.** The first two are the original expression, split apart
 * so the container shape could join them without being written into either. The POSIX branch
 * needs both of its guards: the lookbehind keeps it out of a URL's `//` and out of `and/or`,
 * and requiring a second segment keeps a bare `/` in prose from being redacted. A Run-relative
 * artifact path — `takes/9f2c/audio.mp3`, which every envelope publishes — has no leading
 * separator and is untouched.
 */
const internalPath =
  /file:\/{2,3}[^\s"'<>]*|[A-Za-z]:[\\/][^\s"'<>]*|(?<![A-Za-z0-9+.\-:/])\/(?:[^\s"'<>/]+\/)+[^\s"'<>/]*/gi;
const stackLine = /(?:^|\n)\s*at\s+[^\n]+/g;
const internalMarkers = /(?:node_modules|packages[\\/]production|packages[\\/]video[\\/]src)/gi;

/** Redact host-local implementation details while preserving the public envelope. */
export const sanitizeBoundaryText = (value: string): string =>
  value
    .replace(stackLine, '')
    .replace(internalPath, '<redacted-path>')
    .replace(internalMarkers, '<redacted-internal>');
