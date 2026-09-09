import type { ImageConsumption } from '../contracts/schemas';
/** Only normalized diagnostics and measured usage may cross the trusted image-provider boundary. */
export class ImageGenerationFailure extends Error {
  constructor(
    readonly diagnostic: string,
    readonly consumption?: ImageConsumption,
  ) {
    super(diagnostic);
    this.name = 'ImageGenerationFailure';
  }
}

export class ImageDispatchUncertain extends ImageGenerationFailure {
  constructor(message = 'The image provider dispatch outcome is uncertain.') {
    super(message);
    this.name = 'ImageDispatchUncertain';
  }
}
