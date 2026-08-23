/**
 * The repository-controlled local library.
 *
 * "Repository-controlled" is the whole point: the media is committed, so a clone renders
 * the same frames as CI with no credentials, no network and no fixture wiring. That
 * constraint is also why the stand-in artwork below is vector rather than photographic —
 * an offline, MIT-licensed repository cannot ship a stock photograph, and those entries
 * need the *path* demonstrated, not the picture perfected. Each is a deliberate stand-in
 * that a licensed or generated asset replaces later without touching a SceneInstance:
 * the identity key is the contract, the bytes are not. The one committed raster file is
 * original artwork, which the same licence permits.
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

/**
 * Editorial stand-in for the narrator: a flat figure badge in the accent, drawn square
 * because a persistent element is fitted to a slot rect and a corner slot is square.
 *
 * It lived inline in `plans/vertical-slice.plan.json` until ADR-0005, which is the whole
 * point of moving it: a plan that can carry a `data:` URI is a plan that can hand an
 * element a location, and the boundary in `core/assets.ts` forbids exactly that. Here it
 * is what it always was — repository-controlled media, addressed by identity.
 *
 * Deliberately a stand-in, and it looks like one. §7 of the handoff's gap list is right
 * that `PersistentElementLayer` fits the asset to the whole slot, so this figure occupies
 * half the canvas at `left` and reads as absurd. That is a judgement to make against real
 * character art, which arrives through ADR-0005's loop; the identity key is the contract
 * and the bytes are not.
 */
const NARRATOR_FIGURE =
  'data:image/svg+xml,' +
  '%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22300%22%20height=%22300%22%3E' +
  '%3Ccircle%20cx=%22150%22%20cy=%22105%22%20r=%2252%22%20fill=%22%23FF5A1F%22/%3E' +
  '%3Cpath%20d=%22M40%20300%20C40%20215%2088%20175%20150%20175%20C212%20175%20260%20215%20260%20300%20Z%22%20fill=%22%23FF5A1F%22/%3E' +
  '%3C/svg%3E';

/**
 * The committed evaluation asset for `character_explainer`, stored as the public-relative
 * path `staticFile` addresses.
 *
 * Unlike the two inline stand-ins above, this is real committed media: a 1024 × 1536
 * transparent PNG of an original editorial educator, three-quarter crop, both hands
 * visible. The alpha channel is the point — hair, fingers and an open explanatory
 * gesture expose containment and edge failures a solid geometric stand-in cannot, which
 * is what makes it an evaluation fixture rather than decoration. The identity key is the
 * contract and the bytes are not: it may be replaced behind the same key after review
 * without touching a SceneInstance.
 *
 * The path is relative to `public/` and carries no scheme, which is how every committed
 * file travels through this system — the voice-over does the same. The renderer's
 * static base only exists inside the renderer, so a reference resolved here (in tests,
 * or by the compiler) cannot prefix it; the draw site applies `staticFile` at the
 * moment the uri meets an `<Img>`, where the base is known.
 */
const CHARACTER_EXPLAINER_REFERENCE = 'assets/characters/editorial-explainer-reference.png';

/**
 * The real files this library has committed, as `staticFile` sees them.
 *
 * The list is the library's own claim about its storage, and the disk half of `verify`
 * below is checked against it: a uri that names a file the library never committed is
 * not library media, however well-formed it looks.
 */
const publicFiles = [CHARACTER_EXPLAINER_REFERENCE] as const;

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
  {
    requirement: {
      type: 'character',
      subject: 'Narrator figure, flat editorial silhouette',
      treatment: 'illustration',
      orientation: 'square',
      identityKey: 'narrator',
    },
    ref: { status: 'ready', uri: NARRATOR_FIGURE },
  },
  {
    requirement: {
      type: 'character',
      subject: 'Original editorial educator with an open explanatory gesture',
      treatment: 'illustration',
      orientation: 'portrait',
      identityKey: 'character-explainer-reference',
    },
    ref: { status: 'ready', uri: CHARACTER_EXPLAINER_REFERENCE },
  },
];

/**
 * What "verified" means for media the repository itself ships.
 *
 * Two territories. An inline `data:` URI is verified by being decodable and non-empty.
 * A file under `public/` travels as its public-relative path — the one form that means
 * the same thing inside and outside the renderer — and is verified by existing on disk
 * and being non-empty, checked wherever a filesystem is reachable. Inside the renderer
 * there is none to ask, and none is needed: the bundler has already copied `public/`
 * into the bundle and a missing file fails the image fetch, so the renderer cannot draw
 * a broken file silently. The resolver keeps knowing nothing about storage either way.
 */
const verify = (
  ref: Extract<AssetRef, { status: 'ready' }>,
  _requirement: AssetRequirement,
): LocalAssetVerification => {
  const inline = /^data:(image\/[a-z+]+)(?:;base64)?,(.+)$/i.exec(ref.uri);
  if (inline) {
    if ((inline[2] as string).length < 32) {
      return { ok: false, reason: 'Library asset decodes to an empty image.' };
    }
    return { ok: true };
  }

  const publicPath = publicPathOf(ref.uri);
  if (publicPath === null) {
    return {
      ok: false,
      reason: `Library asset "${ref.uri.slice(0, 32)}…" is not an inline image or a file under public/.`,
    };
  }
  if (!(publicFiles as readonly string[]).includes(publicPath)) {
    return {
      ok: false,
      reason: `Library asset "${publicPath}" is not a file this library has committed.`,
    };
  }

  /**
   * `process.getBuiltinModule` is the one route to `node:fs` that costs the browser
   * bundle nothing: there is no import for webpack to fail on, and `process` is absent
   * in the renderer — where, per this function's header, the bundler and the image
   * fetch are already the enforcement.
   */
  const fs =
    typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function'
      ? process.getBuiltinModule('node:fs')
      : undefined;
  if (!fs) return { ok: true };

  let size = -1;
  try {
    size = fs.statSync(`${import.meta.dirname}/../../public/${publicPath}`).size;
  } catch {
    return { ok: false, reason: `Library asset "${publicPath}" is missing from public/.` };
  }
  if (size <= 0) {
    return { ok: false, reason: `Library asset "${publicPath}" is empty on disk.` };
  }
  return { ok: true };
};

/**
 * The public-relative path a committed-file uri addresses, or `null` when the uri is in
 * neither territory the library ships.
 *
 * A scheme prefix (`data:`, `asset:`, `https:`) names another territory entirely, and an
 * absolute path would be a location claim this library never makes — only the bare
 * public-relative spelling is file territory here, which is what the draw site's
 * `staticFile` expects to receive.
 */
const publicPathOf = (uri: string): string | null => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith('/')) return null;
  return uri;
};

export const repositoryAssetLibrary: LocalAssetLibrary = { entries, verify };
