const internalPath = /(?:file:\/{2,3})?[A-Za-z]:[\\/][^\s"'<>]*/gi;
const stackLine = /(?:^|\n)\s*at\s+[^\n]+/g;
const internalMarkers = /(?:node_modules|packages[\\/]production|packages[\\/]video[\\/]src)/gi;

/** Redact host-local implementation details while preserving the public envelope. */
export const sanitizeBoundaryText = (value: string): string =>
  value
    .replace(stackLine, '')
    .replace(internalPath, '<redacted-path>')
    .replace(internalMarkers, '<redacted-internal>');
