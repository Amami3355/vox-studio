/**
 * The repository-controlled local library.
 *
 * "Repository-controlled" is the whole point: the media is committed, so a clone renders
 * the same frames as CI with no credentials, no network and no fixture wiring. That
 * constraint is also why the artwork is vector rather than photographic — an offline,
 * MIT-licensed repository cannot ship a stock photograph, and the increment needs the
 * *path* demonstrated, not the picture perfected. Each entry is a deliberate stand-in
 * that a licensed or generated asset replaces later without touching a SceneInstance:
 * the identity key is the contract, the bytes are not.
 *
 * Entries are matched by `identityKey`, so replacing the media here is the one edit
 * needed to change what every scene sharing that identity shows.
 */
import type { AssetRef, AssetRequirement } from '../core/assets';
import type { LocalAssetEntry, LocalAssetLibrary, LocalAssetVerification } from './resolver';

/**
 * Editorial stand-in for the housing/rent slice: a dusk skyline of dense apartment
 * blocks, drawn in the `editorial-cold` palette so it sits inside the design system
 * instead of fighting it.
 *
 * Square, not 16:9. The `splitLeft` image region is close to square, and the component
 * crops `cover`, so a landscape source would be centre-cropped into a band and lose both
 * the skyline and the ground. Authoring at the aspect the slot actually has is what
 * keeps the crop from deciding the composition.
 *
 * The lit windows are a `<pattern>` rather than a few dozen rectangles: the subject is
 * *density*, and a regular field of small lights is what reads as many homes at a
 * glance, at any crop.
 */
const HOUSING_CITY_AT_DUSK =
  'data:image/svg+xml,' +
  '%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221200%22%20height=%221200%22%3E' +
  '%3Cdefs%3E' +
  '%3ClinearGradient%20id=%22sky%22%20x1=%220%22%20y1=%220%22%20x2=%220%22%20y2=%221%22%3E' +
  '%3Cstop%20offset=%220%22%20stop-color=%22%23161C28%22/%3E' +
  '%3Cstop%20offset=%220.62%22%20stop-color=%22%232C2632%22/%3E' +
  '%3Cstop%20offset=%221%22%20stop-color=%22%234A3128%22/%3E%3C/linearGradient%3E' +
  '%3Cpattern%20id=%22win%22%20width=%2244%22%20height=%2262%22%20patternUnits=%22userSpaceOnUse%22%3E' +
  '%3Crect%20x=%2212%22%20y=%2216%22%20width=%2218%22%20height=%2226%22%20fill=%22%23FF5A1F%22/%3E' +
  '%3C/pattern%3E%3C/defs%3E' +
  '%3Crect%20width=%221200%22%20height=%221200%22%20fill=%22url(%23sky)%22/%3E' +
  '%3Ccircle%20cx=%22860%22%20cy=%22560%22%20r=%22120%22%20fill=%22%23FF5A1F%22%20opacity=%220.28%22/%3E' +
  '%3Cg%20fill=%22%230D121A%22%3E' +
  '%3Crect%20x=%220%22%20y=%22600%22%20width=%22170%22%20height=%22600%22/%3E' +
  '%3Crect%20x=%22182%22%20y=%22450%22%20width=%22206%22%20height=%22750%22/%3E' +
  '%3Crect%20x=%22400%22%20y=%22690%22%20width=%22148%22%20height=%22510%22/%3E' +
  '%3Crect%20x=%22560%22%20y=%22360%22%20width=%22214%22%20height=%22840%22/%3E' +
  '%3Crect%20x=%22786%22%20y=%22596%22%20width=%22166%22%20height=%22604%22/%3E' +
  '%3Crect%20x=%22964%22%20y=%22484%22%20width=%22236%22%20height=%22716%22/%3E%3C/g%3E' +
  '%3Cg%20fill=%22url(%23win)%22%20opacity=%220.62%22%3E' +
  '%3Crect%20x=%220%22%20y=%22600%22%20width=%22170%22%20height=%22600%22/%3E' +
  '%3Crect%20x=%22182%22%20y=%22450%22%20width=%22206%22%20height=%22750%22/%3E' +
  '%3Crect%20x=%22400%22%20y=%22690%22%20width=%22148%22%20height=%22510%22/%3E' +
  '%3Crect%20x=%22560%22%20y=%22360%22%20width=%22214%22%20height=%22840%22/%3E' +
  '%3Crect%20x=%22786%22%20y=%22596%22%20width=%22166%22%20height=%22604%22/%3E' +
  '%3Crect%20x=%22964%22%20y=%22484%22%20width=%22236%22%20height=%22716%22/%3E%3C/g%3E' +
  '%3C/svg%3E';

const entries: LocalAssetEntry[] = [
  {
    requirement: {
      type: 'image',
      subject: 'Dense apartment buildings in a European city at dusk',
      treatment: 'photo',
      orientation: 'landscape',
      identityKey: 'housing-city-context',
    },
    ref: { status: 'ready', uri: HOUSING_CITY_AT_DUSK },
  },
];

/**
 * What "verified" means for media the repository itself ships.
 *
 * There is no filesystem read here because there is no file: an inline `data:` URI is
 * verified by being decodable and non-empty. When the library grows to real files, this
 * is the one function that changes — the resolver keeps knowing nothing about storage.
 */
const verify = (
  ref: Extract<AssetRef, { status: 'ready' }>,
  _requirement: AssetRequirement,
): LocalAssetVerification => {
  const match = /^data:(image\/[a-z+]+)(?:;base64)?,(.+)$/i.exec(ref.uri);
  if (!match) {
    return {
      ok: false,
      reason: `Library asset "${ref.uri.slice(0, 32)}…" is not an inline image.`,
    };
  }
  if ((match[2] as string).length < 32) {
    return { ok: false, reason: 'Library asset decodes to an empty image.' };
  }
  return { ok: true };
};

export const repositoryAssetLibrary: LocalAssetLibrary = { entries, verify };
