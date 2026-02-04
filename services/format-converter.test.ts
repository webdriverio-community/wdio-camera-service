import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectFormat, requiresConversion } from './format-converter.js';
import { ConversionError, UnsupportedFormatError } from './errors.js';

// Hoist the mock function so it's available during vi.mock hoisting
const mockExecAsync = vi.hoisted(() => vi.fn());

vi.mock('node:fs');
vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

// Import after mocking
import fs from 'node:fs';
import { FormatConverter } from './format-converter.js';

const mockFs = vi.mocked(fs);

describe('format-converter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectFormat', () => {
    it('should detect mjpeg format', () => {
      expect(detectFormat('/path/to/video.mjpeg')).toBe('mjpeg');
      expect(detectFormat('/path/to/video.MJPEG')).toBe('mjpeg');
    });

    it('should detect y4m format', () => {
      expect(detectFormat('/path/to/video.y4m')).toBe('y4m');
    });

    it('should detect video formats', () => {
      expect(detectFormat('/path/to/video.mp4')).toBe('video');
      expect(detectFormat('/path/to/video.webm')).toBe('video');
      expect(detectFormat('/path/to/video.avi')).toBe('video');
      expect(detectFormat('/path/to/video.mov')).toBe('video');
      expect(detectFormat('/path/to/video.MOV')).toBe('video');
    });

    it('should detect image formats', () => {
      expect(detectFormat('/path/to/image.png')).toBe('image');
      expect(detectFormat('/path/to/image.jpg')).toBe('image');
      expect(detectFormat('/path/to/image.jpeg')).toBe('image');
      expect(detectFormat('/path/to/image.gif')).toBe('image');
      expect(detectFormat('/path/to/image.bmp')).toBe('image');
      expect(detectFormat('/path/to/image.PNG')).toBe('image');
    });

    it('should return unknown for unsupported formats', () => {
      expect(detectFormat('/path/to/file.txt')).toBe('unknown');
      expect(detectFormat('/path/to/file.pdf')).toBe('unknown');
      expect(detectFormat('/path/to/file')).toBe('unknown');
    });
  });

  describe('requiresConversion', () => {
    it('should return false for native formats', () => {
      expect(requiresConversion('/path/to/video.mjpeg')).toBe(false);
      expect(requiresConversion('/path/to/video.y4m')).toBe(false);
    });

    it('should return true for video formats', () => {
      expect(requiresConversion('/path/to/video.mp4')).toBe(true);
      expect(requiresConversion('/path/to/video.webm')).toBe(true);
    });

    it('should return true for image formats', () => {
      expect(requiresConversion('/path/to/image.png')).toBe(true);
      expect(requiresConversion('/path/to/image.jpg')).toBe(true);
    });

    it('should return false for unknown formats', () => {
      expect(requiresConversion('/path/to/file.txt')).toBe(false);
    });
  });

  describe('FormatConverter', () => {
    let converter: FormatConverter;

    beforeEach(() => {
      converter = new FormatConverter({
        videoDirectory: '/videos',
        ffmpegPath: 'ffmpeg',
        cacheEnabled: true,
        imageFrameRate: 30,
        imageDuration: 5,
        outputFormat: 'mjpeg',
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.mkdirSync.mockReturnValue(undefined);
      mockFs.statSync.mockReturnValue({ size: 1000 } as fs.Stats);
      mockFs.openSync.mockReturnValue(1);
      mockFs.readSync.mockReturnValue(1000);
      mockFs.closeSync.mockReturnValue(undefined);
      mockFs.renameSync.mockReturnValue(undefined);
      mockFs.unlinkSync.mockReturnValue(undefined);
    });

    describe('initialize', () => {
      it('should create cache directory if it does not exist', async () => {
        mockFs.existsSync.mockReturnValue(false);

        await converter.initialize();

        expect(mockFs.mkdirSync).toHaveBeenCalledWith(
          expect.stringContaining('.cache'),
          { recursive: true },
        );
      });

      it('should not create cache directory if caching is disabled', async () => {
        converter = new FormatConverter({
          videoDirectory: '/videos',
          cacheEnabled: false,
        });

        await converter.initialize();

        expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      });
    });

    describe('getCachedPath', () => {
      it('should return null if caching is disabled', () => {
        converter = new FormatConverter({
          videoDirectory: '/videos',
          cacheEnabled: false,
        });

        const result = converter.getCachedPath('/path/to/video.mp4');

        expect(result).toBeNull();
      });

      it('should return null if source file does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);

        const result = converter.getCachedPath('/path/to/video.mp4');

        expect(result).toBeNull();
      });

      it('should return cached path if cache file exists', () => {
        mockFs.existsSync.mockReturnValue(true);

        const result = converter.getCachedPath('/path/to/video.mp4');

        expect(result).toContain('.cache');
        expect(result).toContain('.mjpeg');
      });

      it('should return null if cache file does not exist', () => {
        mockFs.existsSync.mockImplementation((filePath) => {
          // Source exists, cache does not
          return !String(filePath).includes('.cache');
        });

        const result = converter.getCachedPath('/path/to/video.mp4');

        expect(result).toBeNull();
      });
    });

    describe('convert', () => {
      it('should return original path for mjpeg files', async () => {
        const result = await converter.convert('/path/to/video.mjpeg');

        expect(result).toContain('video.mjpeg');
        expect(mockExecAsync).not.toHaveBeenCalled();
      });

      it('should return original path for y4m files', async () => {
        const result = await converter.convert('/path/to/video.y4m');

        expect(result).toContain('video.y4m');
        expect(mockExecAsync).not.toHaveBeenCalled();
      });

      it('should throw UnsupportedFormatError for unknown formats', async () => {
        await expect(converter.convert('/path/to/file.txt')).rejects.toThrow(UnsupportedFormatError);
      });

      it('should throw error if source file does not exist', async () => {
        mockFs.existsSync.mockReturnValue(false);

        await expect(converter.convert('/path/to/video.mp4')).rejects.toThrow('Source file not found');
      });

      it('should return cached path if available', async () => {
        // File exists and cache exists
        mockFs.existsSync.mockReturnValue(true);

        const result = await converter.convert('/path/to/video.mp4');

        expect(result).toContain('.cache');
        expect(mockExecAsync).not.toHaveBeenCalled();
      });

      it('should convert video file when not cached', async () => {
        // Source exists, cache does not
        mockFs.existsSync.mockImplementation((filePath) => {
          return !String(filePath).includes('.cache');
        });

        mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

        const result = await converter.convert('/path/to/video.mp4');

        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining('-q:v 2'),
        );
        expect(result).toContain('.mjpeg');
      });

      it('should convert image file with loop and duration', async () => {
        mockFs.existsSync.mockImplementation((filePath) => {
          return !String(filePath).includes('.cache');
        });

        mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

        const result = await converter.convert('/path/to/image.png');

        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringMatching(/-loop 1.*-t 5.*-r 30.*-q:v 2/),
        );
        expect(result).toContain('.mjpeg');
      });

      it('should throw ConversionError when FFmpeg fails', async () => {
        mockFs.existsSync.mockImplementation((filePath) => {
          return !String(filePath).includes('.cache');
        });

        const ffmpegError = new Error('FFmpeg error') as Error & { stderr?: string };
        ffmpegError.stderr = 'Invalid input file';
        mockExecAsync.mockRejectedValueOnce(ffmpegError);

        await expect(converter.convert('/path/to/video.mp4')).rejects.toThrow(ConversionError);
      });

      it('should clean up temp file on conversion error', async () => {
        mockFs.existsSync.mockImplementation((filePath) => {
          if (String(filePath).includes('.tmp')) {
            return true;
          }
          return !String(filePath).includes('.cache');
        });

        mockExecAsync.mockRejectedValueOnce(new Error('FFmpeg error'));

        await expect(converter.convert('/path/to/video.mp4')).rejects.toThrow();
        expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('.tmp'));
      });

      it('should use atomic rename for output file', async () => {
        mockFs.existsSync.mockImplementation((filePath) => {
          return !String(filePath).includes('.cache');
        });

        mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

        await converter.convert('/path/to/video.mp4');

        expect(mockFs.renameSync).toHaveBeenCalledWith(
          expect.stringContaining('.tmp'),
          expect.not.stringContaining('.tmp'),
        );
      });
    });

    describe('getOutputExtension', () => {
      it('should return .mjpeg for mjpeg output format', () => {
        expect(converter.getOutputExtension()).toBe('.mjpeg');
      });

      it('should return .y4m for y4m output format', () => {
        converter = new FormatConverter({
          videoDirectory: '/videos',
          outputFormat: 'y4m',
        });

        expect(converter.getOutputExtension()).toBe('.y4m');
      });
    });
  });
});
