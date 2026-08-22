/**
 * Font loading.
 *
 * Kept in its own module with a single side effect so that schemas, constraints and
 * the catalog builder — all of which run in plain Node — never pull the browser font
 * APIs in. Only render entry points import this file.
 *
 * The loaded family names match the fallback stacks declared in `theme.ts`, so the
 * theme object needs no patching: once the font is resolved, the stack resolves to it.
 */
import { loadFont as loadArchivo } from '@remotion/google-fonts/Archivo';
import { loadFont as loadInstrumentSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';

const archivo = loadArchivo('normal', {
  weights: ['400', '600', '800'],
  subsets: ['latin'],
});

/**
 * One weight, because the family ships one. `theme.type.weight.regular` is the only
 * weight anything may set this face at, and asking for a second would resolve to a
 * synthesised bold that the fit has not measured.
 */
const instrumentSerif = loadInstrumentSerif('normal', {
  weights: ['400'],
  subsets: ['latin'],
});

const inter = loadInter('normal', {
  weights: ['400', '600'],
  subsets: ['latin'],
});

const jetBrainsMono = loadJetBrainsMono('normal', {
  weights: ['400', '600'],
  subsets: ['latin'],
});

export const fontFamilies = {
  display: archivo.fontFamily,
  displayAlt: instrumentSerif.fontFamily,
  body: inter.fontFamily,
  mono: jetBrainsMono.fontFamily,
} as const;

/** Await every font. Useful for stills and for the grid app before first paint. */
export const waitForFonts = (): Promise<void> =>
  Promise.all([
    archivo.waitUntilDone(),
    instrumentSerif.waitUntilDone(),
    inter.waitUntilDone(),
    jetBrainsMono.waitUntilDone(),
  ]).then(() => undefined);
