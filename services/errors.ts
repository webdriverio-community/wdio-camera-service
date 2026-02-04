/**
 * Error thrown when FFmpeg is not found on the system
 */
export class FfmpegNotFoundError extends Error {
  constructor(message?: string) {
    super(message ?? 'FFmpeg is not installed or not found in PATH');
    this.name = 'FfmpegNotFoundError';
  }
}

/**
 * Error thrown when FFmpeg conversion fails
 */
export class ConversionError extends Error {
  public readonly sourceFile: string;
  public readonly ffmpegOutput: string;

  constructor(sourceFile: string, ffmpegOutput: string, message?: string) {
    super(message ?? `Failed to convert ${sourceFile}: ${ffmpegOutput}`);
    this.name = 'ConversionError';
    this.sourceFile = sourceFile;
    this.ffmpegOutput = ffmpegOutput;
  }
}

/**
 * Error thrown when an unsupported file format is provided
 */
export class UnsupportedFormatError extends Error {
  public readonly filePath: string;
  public readonly extension: string;

  static readonly SUPPORTED_FORMATS = [
    '.mjpeg', '.y4m',           // Native formats
    '.mp4', '.webm', '.avi', '.mov',  // Video formats
    '.png', '.jpg', '.jpeg', '.gif', '.bmp',  // Image formats
  ];

  constructor(filePath: string, extension: string) {
    const supportedList = UnsupportedFormatError.SUPPORTED_FORMATS.join(', ');
    super(`Unsupported format "${extension}" for file "${filePath}". Supported formats: ${supportedList}`);
    this.name = 'UnsupportedFormatError';
    this.filePath = filePath;
    this.extension = extension;
  }
}
