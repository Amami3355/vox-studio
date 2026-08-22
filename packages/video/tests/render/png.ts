/**
 * Just enough PNG to address a pixel.
 *
 * The other render suites hash a whole still, which answers "did this frame change" and
 * nothing else. A safe area is a statement about a *region* — content inside it, backdrop
 * outside it — and no hash of the whole frame can tell those two apart. So the still has
 * to be decoded.
 *
 * `node:zlib` does the compression half; what is left is the container and the five
 * scanline filters, which is small, fixed by the spec, and worth more than a dependency
 * added so one test can read a rectangle. Deliberately narrow: 8-bit, non-interlaced,
 * which is what a Chrome screenshot is. Anything else throws rather than guessing.
 */
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export type Bitmap = {
  width: number;
  height: number;
  /** Bytes per pixel: 3 for RGB, 4 for RGBA. */
  channels: number;
  /** Row-major, unfiltered, `channels` bytes per pixel. */
  pixels: Buffer;
};

/** A rectangle in pixels, from the top-left of the canvas. */
export type Region = { x: number; y: number; width: number; height: number };

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Colour type → samples per pixel. 4 is grey+alpha, 6 is RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export const decodePng = (buffer: Buffer): Bitmap => {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG.');

  let width = 0;
  let height = 0;
  let channels = 0;
  const deflated: Buffer[] = [];

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length; // length + type + data + CRC

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data.readUInt8(8);
      const colourType = data.readUInt8(9);
      const interlace = data.readUInt8(12);
      channels = CHANNELS[colourType] ?? 0;

      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(
          `Unsupported PNG: bit depth ${depth}, colour type ${colourType}, interlace ${interlace}.`,
        );
      }
    } else if (type === 'IDAT') {
      deflated.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
  }

  if (width === 0 || height === 0) throw new Error('PNG carried no IHDR.');

  return {
    width,
    height,
    channels,
    pixels: unfilter(inflateSync(Buffer.concat(deflated)), width, height, channels),
  };
};

/**
 * Undo the per-scanline filters.
 *
 * Every filter predicts a byte from its left neighbour (`a`), the byte above (`b`) and the
 * one above-left (`c`), and stores the difference. The prediction reads *already
 * reconstructed* bytes, which is why this writes into the output as it goes rather than
 * transforming the raw buffer in place.
 */
const unfilter = (raw: Buffer, width: number, height: number, bpp: number): Buffer => {
  const stride = width * bpp;
  const pixels = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] as number;
    const source = y * (stride + 1) + 1;
    const row = y * stride;
    const above = row - stride;

    for (let i = 0; i < stride; i += 1) {
      const x = raw[source + i] as number;
      const a = i >= bpp ? (pixels[row + i - bpp] as number) : 0;
      const b = y > 0 ? (pixels[above + i] as number) : 0;
      const c = i >= bpp && y > 0 ? (pixels[above + i - bpp] as number) : 0;

      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + ((a + b) >> 1);
          break;
        case 4:
          value = x + paeth(a, b, c);
          break;
        default:
          throw new Error(`Unknown PNG filter ${filter} on row ${y}.`);
      }

      pixels[row + i] = value & 0xff;
    }
  }

  return pixels;
};

/** The spec's predictor: whichever of left, above, above-left is closest to a + b − c. */
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** One pixel as `#rrggbb`, alpha ignored — a still is composited over an opaque backdrop. */
export const pixelAt = (bitmap: Bitmap, x: number, y: number): string => {
  const at = (y * bitmap.width + x) * bitmap.channels;
  const hex = (index: number) =>
    (bitmap.pixels[at + index] as number).toString(16).padStart(2, '0');
  return bitmap.channels >= 3 ? `#${hex(0)}${hex(1)}${hex(2)}` : `#${hex(0)}${hex(0)}${hex(0)}`;
};

/**
 * A digest of some rectangles of one bitmap, so two renders can be compared over exactly
 * the area under test. Regions are hashed in the order given; an empty list is refused
 * rather than hashed to a constant, since a region list that silently came out empty would
 * make every comparison pass.
 */
export const hashRegions = (bitmap: Bitmap, regions: Region[]): string => {
  if (regions.length === 0) throw new Error('Refusing to hash an empty region list.');

  const digest = createHash('md5');
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      const from = (y * bitmap.width + region.x) * bitmap.channels;
      digest.update(bitmap.pixels.subarray(from, from + region.width * bitmap.channels));
    }
  }

  return digest.digest('hex');
};

/**
 * Every distinct colour in some rectangles of one bitmap.
 *
 * The absolute form of the question `hashRegions` asks relatively: an area that has to be
 * *empty* on a ground no control knows cannot be compared to one, but it can be asked
 * whether it holds a single colour. `SceneMeta.paintsOwnGround` carries when that applies.
 *
 * Returns the set rather than a boolean so a failure can say what it found.
 */
export const coloursIn = (bitmap: Bitmap, regions: Region[]): Set<string> => {
  if (regions.length === 0) throw new Error('Refusing to read an empty region list.');

  const found = new Set<string>();
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        found.add(pixelAt(bitmap, x, y));
      }
    }
  }
  return found;
};

/**
 * What a quiet border must be, and what it is — in whichever of the two readings applies.
 *
 * `SceneMeta.paintsOwnGround` says why there are two and when each is right; it is not
 * restated here. What lives here is the mechanism: which reading each flag selects, and
 * what the two strings are made of.
 *
 * `basis` travels with them because the two readings are not the same measurement, and a
 * failure that does not say which one it took is unreadable. Against the control, both
 * strings are digests of the same bands of two bitmaps. Flat, `expected` is the frame's own
 * corner and `actual` is every colour the band contains — so a pass means the band is that
 * one colour, and the comparison is with the frame itself rather than with anything else.
 *
 * Two suites ask this — `render/safe-area.test.ts` over the examples, `stress/content-
 * stress.test.ts` over the schemas' own ceilings — and each carried its own copy while the
 * rule had one branch. With two branches that is the copy that goes stale, and a stale copy
 * of *this* rule reads as a design regression in a suite nobody has changed.
 */
export type BorderReading = {
  expected: string;
  actual: string;
  basis: 'equals the backdrop control' | 'is one flat colour';
};

export const quietBorderReading = (
  bitmap: Bitmap,
  border: Region[],
  options: { control: Bitmap; paintsOwnGround: boolean },
): BorderReading =>
  options.paintsOwnGround
    ? {
        expected: pixelAt(bitmap, 0, 0),
        actual: [...coloursIn(bitmap, border)].join(' '),
        basis: 'is one flat colour',
      }
    : {
        expected: hashRegions(options.control, border),
        actual: hashRegions(bitmap, border),
        basis: 'equals the backdrop control',
      };

/**
 * The four bands hugging the *inner* edges of a rectangle — the border a scene is meant
 * to leave quiet. `bandsOutside` asks whether a scene stayed in its rectangle at all;
 * this asks whether it stopped short of the rectangle's edges, which is the difference
 * between "legal" and "readable".
 *
 * Overlapping corners would be hashed twice and are trimmed off the vertical pair, so the
 * bands remain an exact cover.
 */
export const bandsInside = (inside: Region, thickness: number): Region[] =>
  [
    { x: inside.x, y: inside.y, width: inside.width, height: thickness },
    {
      x: inside.x,
      y: inside.y + inside.height - thickness,
      width: inside.width,
      height: thickness,
    },
    {
      x: inside.x,
      y: inside.y + thickness,
      width: thickness,
      height: inside.height - 2 * thickness,
    },
    {
      x: inside.x + inside.width - thickness,
      y: inside.y + thickness,
      width: thickness,
      height: inside.height - 2 * thickness,
    },
  ].filter((band) => band.width > 0 && band.height > 0);

/**
 * The rectangles covering everything a safe area excludes: the bands above, below, left
 * and right of the rectangle the scene was given. Expressed as bands rather than as one
 * subtraction because the complement of a rectangle is not a rectangle, and four bands
 * that meet only at the corners are the cheapest exact cover of it.
 */
export const bandsOutside = (inside: Region, width: number, height: number): Region[] =>
  [
    { x: 0, y: 0, width, height: inside.y },
    { x: 0, y: inside.y + inside.height, width, height: height - inside.y - inside.height },
    { x: 0, y: inside.y, width: inside.x, height: inside.height },
    {
      x: inside.x + inside.width,
      y: inside.y,
      width: width - inside.x - inside.width,
      height: inside.height,
    },
  ].filter((band) => band.width > 0 && band.height > 0);

/**
 * A rectangle given as percentage insets from each edge, in pixels.
 *
 * `SafeArea` and `slotRect` speak the same shape with the same reading — a share of the
 * canvas inset from each edge — and both render suites have to turn one into pixels before
 * they can hash it. Insets in and a `Region` out, with the canvas passed rather than
 * imported, so this stays the arithmetic and not a second opinion about how big the canvas
 * is.
 */
export const regionOfInsets = (
  insets: { top: number; right: number; bottom: number; left: number },
  width: number,
  height: number,
): Region => ({
  x: Math.round((insets.left / 100) * width),
  y: Math.round((insets.top / 100) * height),
  width: Math.round(((100 - insets.left - insets.right) / 100) * width),
  height: Math.round(((100 - insets.top - insets.bottom) / 100) * height),
});
