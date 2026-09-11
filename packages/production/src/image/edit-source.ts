import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
// Gemini 3 Pro Image's documented inline-image limit (use decimal MB conservatively).
const INLINE_BYTES = 7_000_000;

/** Only the provider's reference copy changes; the Run retains the original PNG and digest. */
export async function prepareImageEditSource(bytes: Uint8Array): Promise<{
  sourceImage: Uint8Array;
  sourceImageMimeType?: 'image/webp';
}> {
  if (bytes.byteLength <= INLINE_BYTES) return { sourceImage: bytes };
  const directory = await mkdtemp(join(tmpdir(), 'vox-image-edit-'));
  try {
    const input = join(directory, 'source.png');
    const output = join(directory, 'reference.webp');
    await writeFile(input, bytes);
    // Try lossless at the original dimensions first. A high-quality reference is
    // sufficient when photographic PNG noise cannot fit without compression.
    for (const lossless of [true, false]) {
      await execute(
        'ffmpeg',
        [
          '-v',
          'error',
          '-nostdin',
          '-y',
          '-i',
          input,
          '-frames:v',
          '1',
          '-c:v',
          'libwebp',
          '-lossless',
          lossless ? '1' : '0',
          '-quality',
          '95',
          '-compression_level',
          '6',
          '-threads',
          '1',
          output,
        ],
        { timeout: 60_000, windowsHide: true, maxBuffer: 64 * 1024 },
      );
      const reference = await readFile(output);
      if (reference.byteLength <= INLINE_BYTES) {
        return { sourceImage: reference, sourceImageMimeType: 'image/webp' };
      }
    }
    throw new Error('The encoded image reference exceeds the inline input limit.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
