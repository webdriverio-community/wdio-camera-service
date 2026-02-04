import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SevereServiceError } from 'webdriverio';
import fs from 'node:fs';
import path from 'node:path';

// Hoist the mock function so it's available during vi.mock hoisting
const mockExecAsync = vi.hoisted(() => vi.fn());

vi.mock('node:fs');
vi.mock('webdriverio');
vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

// Import after mocking
import CameraService from './camera.service.js';

const mockFs = vi.mocked(fs);

describe('CameraService', () => {
  const validOptions = {
    defaultCameraFeed: '/path/to/default.mjpeg',
    videoDirectory: '/path/to/videos',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(Buffer.from('mock video data'));
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.statSync.mockReturnValue({ size: 1000 } as fs.Stats);
    mockFs.openSync.mockReturnValue(1);
    mockFs.readSync.mockReturnValue(1000);
    mockFs.closeSync.mockReturnValue(undefined);
    mockFs.renameSync.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid options', () => {
      const service = new CameraService(validOptions);
      expect(service).toBeInstanceOf(CameraService);
    });

    it('should throw SevereServiceError when defaultCameraFeed is missing', () => {
      const invalidOptions = { ...validOptions, defaultCameraFeed: '' };

      expect(() => new CameraService(invalidOptions)).toThrow(SevereServiceError);
    });

    it('should throw SevereServiceError when videoDirectory is missing', () => {
      const invalidOptions = { ...validOptions, videoDirectory: '' };

      expect(() => new CameraService(invalidOptions)).toThrow(SevereServiceError);
    });

    it('should throw SevereServiceError when both options are missing', () => {
      const invalidOptions = { defaultCameraFeed: '', videoDirectory: '' };

      expect(() => new CameraService(invalidOptions)).toThrow(SevereServiceError);
    });

    it('should accept new format conversion options', () => {
      const options = {
        ...validOptions,
        imageFrameRate: 24,
        imageDuration: 10,
        ffmpegPath: '/custom/ffmpeg',
        cacheEnabled: false,
        outputFormat: 'y4m' as const,
      };

      const service = new CameraService(options);
      expect(service).toBeInstanceOf(CameraService);
    });
  });

  describe('onPrepare', () => {
    it('should create video directory if it does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);
      const service = new CameraService(validOptions);

      await service.onPrepare();

      expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/videos');
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/path/to/videos', { recursive: true });
    });

    it('should not create directory if it already exists', async () => {
      mockFs.existsSync.mockReturnValue(true);
      const service = new CameraService(validOptions);

      await service.onPrepare();

      expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/videos');
    });

    it('should check FFmpeg availability when using non-native format', async () => {
      const options = {
        ...validOptions,
        defaultCameraFeed: '/path/to/default.mp4',
      };
      const service = new CameraService(options);

      // FFmpeg available
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'ffmpeg version 6.0',
        stderr: '',
      });

      // Conversion call
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      // Source file exists but cache doesn't
      mockFs.existsSync.mockImplementation((p) => {
        if (String(p).includes('.cache')) {return false;}
        return true;
      });

      await service.onPrepare();

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('ffmpeg'),
      );
    });

    it('should throw FfmpegNotFoundError when FFmpeg is needed but not available', async () => {
      const options = {
        ...validOptions,
        defaultCameraFeed: '/path/to/default.mp4',
      };
      const service = new CameraService(options);

      mockExecAsync.mockRejectedValueOnce(new Error('Command not found'));

      await expect(service.onPrepare()).rejects.toThrow('FFmpeg is required');
    });

    it('should not check FFmpeg when using native mjpeg format', async () => {
      const service = new CameraService(validOptions);

      await service.onPrepare();

      // Should not have called ffmpeg -version
      expect(mockExecAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('-version'),
      );
    });

    it('should pre-convert default feed if non-native format', async () => {
      const options = {
        ...validOptions,
        defaultCameraFeed: '/path/to/default.mp4',
      };
      const service = new CameraService(options);

      // FFmpeg available
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'ffmpeg version 6.0',
        stderr: '',
      });

      // Conversion call
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      mockFs.existsSync.mockImplementation((p) => {
        if (String(p).includes('.cache')) {return false;}
        return true;
      });

      await service.onPrepare();

      // Should have called ffmpeg for conversion (second call)
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('-q:v 2'),
      );
    });
  });

  describe('onWorkerStart', () => {
    let service: CameraService;
    const mockCapabilities = {
      browserName: 'chrome',
      platformName: 'desktop',
      'goog:chromeOptions': undefined,
    };

    beforeEach(async () => {
      service = new CameraService(validOptions);
      vi.spyOn(process, 'cwd').mockReturnValue('/current/working/dir');
      vi.spyOn(path, 'resolve').mockImplementation((...paths) => {
        return paths.filter(Boolean).join('/').replace(/\/+/g, '/');
      });
      await service.onPrepare();
    });

    it('should configure Chrome options for Chrome browser on desktop', async () => {
      const capabilities = { ...mockCapabilities };

      await service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('default.mjpeg'));
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-cid.mjpeg'),
        expect.any(Uint8Array),
      );
      expect(capabilities['goog:chromeOptions']).toEqual({
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          expect.stringContaining('--use-file-for-fake-video-capture='),
        ],
      });
    });

    it('should use Android video directory for Android Chrome', async () => {
      const capabilities = {
        ...mockCapabilities,
        platformName: 'android',
      };

      await service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('default.mjpeg'));
      expect(capabilities['goog:chromeOptions']).toEqual({
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          expect.stringContaining('--use-file-for-fake-video-capture=/storage/emulated/0/Android'),
        ],
      });
    });

    it('should append to existing chromeOptions.args when they exist', async () => {
      const capabilities = {
        ...mockCapabilities,
        'goog:chromeOptions': {
          args: ['--existing-flag'],
        },
      };

      await service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(capabilities['goog:chromeOptions'].args).toEqual([
        '--existing-flag',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        expect.stringContaining('--use-file-for-fake-video-capture='),
      ]);
    });

    it('should create args array when chromeOptions exists but no args', async () => {
      const capabilities = {
        ...mockCapabilities,
        'goog:chromeOptions': {} as { args?: string[] },
      };

      await service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(capabilities['goog:chromeOptions'].args).toEqual([
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        expect.stringContaining('--use-file-for-fake-video-capture='),
      ]);
    });

    it('should log message for non-Chrome browsers', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const capabilities = {
        ...mockCapabilities,
        browserName: 'firefox',
      };

      await service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Injecting camera source only supported in Chrome browsers (current browserName: firefox)',
      );
      expect(capabilities['goog:chromeOptions']).toBeUndefined();
    });

    it('should work with browserName containing "Chrome" (case insensitive)', async () => {
      const capabilities = {
        browserName: 'Google Chrome',
        platformName: 'desktop',
        'goog:chromeOptions': undefined,
      };

      await service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(capabilities['goog:chromeOptions']).toBeDefined();
    });

    it('should use y4m extension when outputFormat is y4m', async () => {
      const options = {
        ...validOptions,
        outputFormat: 'y4m' as const,
      };
      service = new CameraService(options);
      await service.onPrepare();

      const capabilities = { ...mockCapabilities };
      await service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-cid.y4m'),
        expect.any(Uint8Array),
      );
    });
  });

  describe('before', () => {
    let service: CameraService;
    let mockBrowser: {
      capabilities: {
        browserName: string;
        platformName: string;
      };
      requestedCapabilities?: {
        'goog:chromeOptions'?: {
          args?: string[];
        };
      };
      addCommand: ReturnType<typeof vi.fn>;
      pushFile?: ReturnType<typeof vi.fn>;
    };

    beforeEach(async () => {
      service = new CameraService(validOptions);
      mockBrowser = {
        capabilities: {
          browserName: 'chrome',
          platformName: 'desktop',
        },
        requestedCapabilities: {
          'goog:chromeOptions': {
            args: ['--use-file-for-fake-video-capture=/existing/path/video.mjpeg'],
          },
        },
        addCommand: vi.fn(),
        pushFile: vi.fn(),
      };
      vi.spyOn(process, 'cwd').mockReturnValue('/current/working/dir');
      vi.spyOn(path, 'resolve').mockImplementation((...paths) => {
        return paths.filter(Boolean).join('/').replace(/\/+/g, '/');
      });
      await service.onPrepare();
    });

    it('should add changeCameraSource command to browser', () => {
      service.before({}, {}, mockBrowser as unknown as WebdriverIO.Browser);

      expect(mockBrowser.addCommand).toHaveBeenCalledWith(
        'changeCameraSource',
        expect.any(Function),
      );
    });

    describe('changeCameraSource command', () => {
      let changeCameraSourceFn: Function;

      beforeEach(() => {
        service.before({}, {}, mockBrowser as unknown as WebdriverIO.Browser);
        changeCameraSourceFn = mockBrowser.addCommand.mock.calls[0][1];
      });

      it('should change camera source for desktop Chrome', async () => {
        const newVideoPath = 'new/video/path.mjpeg';

        await changeCameraSourceFn(newVideoPath);

        expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining(newVideoPath));
        expect(mockFs.writeFileSync).toHaveBeenCalledWith(
          expect.stringContaining('video.mjpeg'),
          expect.any(Uint8Array),
        );
      });

      it('should change camera source for Android Chrome using pushFile', async () => {
        mockBrowser.capabilities.platformName = 'android';
        const newVideoPath = 'new/video/path.mjpeg';
        const mockVideoData = Buffer.from('new video data');
        mockFs.readFileSync.mockReturnValue(mockVideoData);

        await changeCameraSourceFn(newVideoPath);

        expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining(newVideoPath));
        expect(mockBrowser.pushFile).toHaveBeenCalledWith(
          expect.stringContaining('video.mjpeg'),
          mockVideoData.toString('base64'),
        );
      });

      it('should throw error when new camera source does not exist', async () => {
        mockFs.existsSync.mockReturnValue(false);
        const newVideoPath = 'nonexistent/video/path.mjpeg';

        await expect(changeCameraSourceFn(newVideoPath)).rejects.toThrow(
          'New source camera feed',
        );
      });

      it('should throw error when default camera feed does not exist (desktop)', async () => {
        mockFs.existsSync.mockImplementation((filePath) => {
          if (typeof filePath === 'string' && filePath.includes('new/video/path.mjpeg')) {
            return true;
          }
          if (typeof filePath === 'string' && filePath.includes('video.mjpeg')) {
            return false;
          }
          return true;
        });
        const newVideoPath = 'new/video/path.mjpeg';

        await expect(changeCameraSourceFn(newVideoPath)).rejects.toThrow(
          'Default camera feed',
        );
      });

      it('should handle case when no camera source is found in capabilities', async () => {
        mockBrowser.requestedCapabilities = { 'goog:chromeOptions': { args: [] } };
        service.before({}, {}, mockBrowser as unknown as WebdriverIO.Browser);
        const changeCameraSourceFnNoSource = mockBrowser.addCommand.mock.calls[1][1];

        await changeCameraSourceFnNoSource('new/video/path.mjpeg');

        expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      });

      it('should handle case when requestedCapabilities is undefined', async () => {
        // Create fresh mock browser for this test
        const freshMockBrowser = {
          ...mockBrowser,
          requestedCapabilities: undefined,
          addCommand: vi.fn(),
        };

        service.before({}, {}, freshMockBrowser as unknown as WebdriverIO.Browser);

        // Only one addCommand should be called in this case
        expect(freshMockBrowser.addCommand).toHaveBeenCalledTimes(1);
      });

      it('should convert video format before changing camera source', async () => {
        mockFs.existsSync.mockImplementation((p) => {
          // Cache doesn't exist but files do
          if (String(p).includes('.cache')) {return false;}
          return true;
        });

        mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

        const newVideoPath = 'new/video/path.mp4';
        await changeCameraSourceFn(newVideoPath);

        // Should have called FFmpeg for conversion
        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining('-q:v 2'),
        );
      });

      it('should convert image format before changing camera source', async () => {
        mockFs.existsSync.mockImplementation((p) => {
          if (String(p).includes('.cache')) {return false;}
          return true;
        });

        mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

        const newImagePath = 'new/image/qrcode.png';
        await changeCameraSourceFn(newImagePath);

        // Should have called FFmpeg for image conversion (single frame)
        expect(mockExecAsync).toHaveBeenCalledWith(
          expect.stringContaining('-frames:v 1'),
        );
      });
    });
  });
});
