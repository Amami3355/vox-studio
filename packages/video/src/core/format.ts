/** Deterministic value formatting. No locale lookups: the render must be reproducible. */

const GROUP = /\B(?=(\d{3})+(?!\d))/g;

export const formatValue = (value: number, unit = ''): string => {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const [int = '0', frac] = Math.abs(rounded).toString().split('.');
  const grouped = int.replace(GROUP, ' ');
  const sign = rounded < 0 ? '-' : '';
  const body = frac ? `${grouped}.${frac}` : grouped;
  if (!unit) return `${sign}${body}`;
  return unit === '%' || unit === '°' ? `${sign}${body}${unit}` : `${sign}${body} ${unit}`;
};

/** Interpolate a counter toward its final value without ever overshooting the label. */
export const countTo = (value: number, progress: number): number =>
  value * Math.min(1, Math.max(0, progress));

export const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
