import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ConversionError, UnsupportedFormatError } from './errors.js';

const execAsync = promisify(exec);

export type FormatType = 'mjpeg' | 'y4m' | 'video' | 'image' | 'unknown';

const EXTENSION_TO_FORMAT: Record<string, FormatType> = {
  // Native formats
  '.mjpeg': 'mjpeg',
  '.y4m': 'y4m',
  // Video formats (including GIF - FFmpeg treats GIFs as video streams)
  '.mp4': 'video',
  '.webm': 'video',
  '.avi': 'video',
  '.mov': 'video',
  '.gif': 'video',
  // Image formats (static images only)
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.bmp': 'image',
};

export interface FormatConverterOptions {
  videoDirectory: string;
  ffmpegPath?: string;
  cacheEnabled?: boolean;
  outputFormat?: 'mjpeg' | 'y4m';
}

/**
 * Detect the format type of a file based on its extension
 */
export function detectFormat(filePath: string): FormatType {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_FORMAT[ext] ?? 'unknown';
}

/**
 * Check if a file requires conversion (not a native format)
 */
export function requiresConversion(filePath: string): boolean {
  const format = detectFormat(filePath);
  return format === 'video' || format === 'image';
}

/**
 * FormatConverter handles converting various media formats to MJPEG
 */
export class FormatConverter {
  private readonly cacheDir: string;
  private readonly ffmpegPath: string;
  private readonly cacheEnabled: boolean;
  private readonly outputFormat: 'mjpeg' | 'y4m';

  constructor(options: FormatConverterOptions) {
    this.cacheDir = path.join(options.videoDirectory, '.cache');
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
    this.cacheEnabled = options.cacheEnabled ?? true;
    this.outputFormat = options.outputFormat ?? 'mjpeg';
  }

  /**
   * Initialize the converter (create cache directory)
   */
  async initialize(): Promise<void> {
    if (this.cacheEnabled && !fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Compute a hash for a file based on first 64KB + file size
   */
  private computeFileHash(filePath: string): string {
    const stats = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r');
    const bufferSize = Math.min(65536, stats.size); // 64KB or file size
    const buffer = Buffer.alloc(bufferSize);
    fs.readSync(fd, buffer, 0, bufferSize, 0);
    fs.closeSync(fd);

    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    hash.update(stats.size.toString());
    return hash.digest('hex');
  }

  /**
   * Get the cached file path for a source file, or null if not cached
   */
  getCachedPath(sourcePath: string): string | null {
    if (!this.cacheEnabled) {
      return null;
    }

    const absolutePath = path.resolve(process.cwd(), sourcePath);
    if (!fs.existsSync(absolutePath)) {
      return null;
    }

    const hash = this.computeFileHash(absolutePath);
    const cachedFile = path.join(this.cacheDir, `${hash}.${this.outputFormat}`);

    if (fs.existsSync(cachedFile)) {
      return cachedFile;
    }
    return null;
  }

  /**
   * Convert a file to the target format
   * Returns the path to the converted file (may be cached)
   */
  async convert(sourcePath: string): Promise<string> {
    const absolutePath = path.resolve(process.cwd(), sourcePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Source file not found: ${absolutePath}`);
    }

    const format = detectFormat(absolutePath);

    // Native formats don't need conversion
    if (format === 'mjpeg' || format === 'y4m') {
      return absolutePath;
    }

    if (format === 'unknown') {
      throw new UnsupportedFormatError(absolutePath, path.extname(absolutePath));
    }

    // Check cache first
    const cachedPath = this.getCachedPath(sourcePath);
    if (cachedPath) {
      return cachedPath;
    }

    // Generate output path
    const hash = this.computeFileHash(absolutePath);
    const outputPath = this.cacheEnabled
      ? path.join(this.cacheDir, `${hash}.${this.outputFormat}`)
      : path.join(path.dirname(absolutePath), `${path.basename(absolutePath, path.extname(absolutePath))}.${this.outputFormat}`);

    // Use temp file for atomic write
    const tempPath = `${outputPath}.tmp`;

    try {
      if (format === 'video') {
        await this.convertVideo(absolutePath, tempPath);
      } else if (format === 'image') {
        await this.convertImage(absolutePath, tempPath);
      }

      // Atomic rename
      fs.renameSync(tempPath, outputPath);
      return outputPath;
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  /**
   * Execute an FFmpeg command and throw ConversionError on failure
   */
  private async execFfmpeg(command: string, inputPath: string): Promise<void> {
    try {
      await execAsync(command);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? (error as Error & { stderr?: string }).stderr ?? error.message
        : String(error);
      throw new ConversionError(inputPath, errorMessage);
    }
  }

  /**
   * Convert a video file to MJPEG
   * -pix_fmt yuvj420p: convert to JPEG-compatible pixel format
   * -f mjpeg: explicitly specify output format (needed for temp files)
   * -q:v 2 sets quality (2 is high quality, 31 is lowest)
   */
  private async convertVideo(inputPath: string, outputPath: string): Promise<void> {
    const command = `"${this.ffmpegPath}" -i "${inputPath}" -pix_fmt yuvj420p -f mjpeg -q:v 2 -y "${outputPath}"`;
    await this.execFfmpeg(command, inputPath);
  }

  /**
   * Convert an image to MJPEG (single frame, Chrome loops it)
   * -frames:v 1: output single frame
   * -pix_fmt yuvj420p: convert to JPEG-compatible pixel format (fixes green output from RGBA images)
   * -f mjpeg: explicitly specify output format (needed for temp files)
   * -q:v 2: quality
   */
  private async convertImage(inputPath: string, outputPath: string): Promise<void> {
    const command = `"${this.ffmpegPath}" -i "${inputPath}" -frames:v 1 -pix_fmt yuvj420p -f mjpeg -q:v 2 -y "${outputPath}"`;
    await this.execFfmpeg(command, inputPath);
  }

  /**
   * Get the output file extension based on output format
   */
  getOutputExtension(): string {
    return `.${this.outputFormat}`;
  }
}
