const digest = (value: string, name: string): string => {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError(`${name} must be a lowercase SHA-256.`);
  return value;
};

export const RUN_PATHS = {
  checkpoint: 'run.json',
  request: 'inputs/request.json',
  plan: (planSha256: string) => `inputs/plans/${digest(planSha256, 'planSha256')}.json`,
  validationReport: (validationInputSha256: string) =>
    `artifacts/validation/${digest(validationInputSha256, 'validationInputSha256')}/report.json`,
  preflightReport: (preflightInputSha256: string) =>
    `artifacts/preflight/${digest(preflightInputSha256, 'preflightInputSha256')}/report.json`,
  takeAudio: (takeSha256: string) =>
    `artifacts/takes/${digest(takeSha256, 'takeSha256')}/audio.mp3`,
  takeAlignment: (takeSha256: string) =>
    `artifacts/takes/${digest(takeSha256, 'takeSha256')}/alignment.json`,
  takeManifest: (takeSha256: string) =>
    `artifacts/takes/${digest(takeSha256, 'takeSha256')}/take.json`,
  timedBeatFold: (takeSha256: string, beatShapeSha256: string) =>
    `artifacts/takes/${digest(takeSha256, 'takeSha256')}/folds/${digest(
      beatShapeSha256,
      'beatShapeSha256',
    )}/timed-beats.json`,
  compiledDocument: (compileInputSha256: string) =>
    `artifacts/compilations/${digest(compileInputSha256, 'compileInputSha256')}/document.json`,
  compileReport: (compileInputSha256: string) =>
    `artifacts/compilations/${digest(compileInputSha256, 'compileInputSha256')}/report.json`,
  preview: (renderInputSha256: string) =>
    `artifacts/renders/${digest(renderInputSha256, 'renderInputSha256')}/preview.mp4`,
  receipt: (sequence: number, command: string) => {
    if (!Number.isSafeInteger(sequence) || sequence < 1)
      throw new TypeError('Receipt sequence is invalid.');
    if (!/^[a-z]+(?:[.-][a-z]+)*$/.test(command))
      throw new TypeError('Receipt command is invalid.');
    return `receipts/${sequence.toString().padStart(20, '0')}-${command.replaceAll('.', '-')}.json`;
  },
} as const;
