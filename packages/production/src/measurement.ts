export type ProductionMeasurement = {
  operation: string;
  elapsedMs: number;
  bytes?: number;
  count?: number;
};

/** Opt-in numeric diagnostics: no request contents, media or credentials. */
export const reportMeasurement = (measurement: ProductionMeasurement): void => {
  if (process.env.VOX_PROFILE_PRODUCTION === '1') {
    console.error(JSON.stringify({ type: 'production_timing', ...measurement }));
  }
};
