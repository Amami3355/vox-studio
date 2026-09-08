/** Only normalized diagnostics may cross the trusted image-provider boundary. */
export class ImageGenerationFailure extends Error {
  constructor(readonly diagnostic: string) {
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
