import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SevereServiceError } from 'webdriverio';
import fs from 'node:fs';
import path from 'node:path';
import CameraService from './camera.service.js';

vi.mock('node:fs');
vi.mock('webdriverio');

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
  });

  describe('onPrepare', () => {
    it('should create video directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      const service = new CameraService(validOptions);

      service.onPrepare();

      expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/videos');
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/path/to/videos', { recursive: true });
    });

    it('should not create directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      const service = new CameraService(validOptions);

      service.onPrepare();

      expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/videos');
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('onWorkerStart', () => {
    let service: CameraService;
    const mockCapabilities = {
      browserName: 'chrome',
      platformName: 'desktop',
    };

    beforeEach(() => {
      service = new CameraService(validOptions);
      vi.spyOn(process, 'cwd').mockReturnValue('/current/working/dir');
      vi.spyOn(path, 'resolve').mockImplementation((...paths) => {
        return paths.filter(Boolean).join('/').replace(/\/+/g, '/');
      });
    });

    it('should configure Chrome options for Chrome browser on desktop', () => {
      const capabilities = { ...mockCapabilities };

      service.onWorkerStart('test-cid', capabilities, [], {}, []);

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

    it('should use Android video directory for Android Chrome', () => {
      const capabilities = {
        ...mockCapabilities,
        platformName: 'android',
      };

      service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('default.mjpeg'));
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      expect(capabilities['goog:chromeOptions']).toEqual({
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          expect.stringContaining('--use-file-for-fake-video-capture=/storage/emulated/0/Android'),
        ],
      });
    });

    it('should append to existing chromeOptions.args when they exist', () => {
      const capabilities = {
        ...mockCapabilities,
        'goog:chromeOptions': {
          args: ['--existing-flag'],
        },
      };

      service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(capabilities['goog:chromeOptions'].args).toEqual([
        '--existing-flag',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        expect.stringContaining('--use-file-for-fake-video-capture='),
      ]);
    });

    it('should create args array when chromeOptions exists but no args', () => {
      const capabilities = {
        ...mockCapabilities,
        'goog:chromeOptions': {} as { args?: string[] },
      };

      service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(capabilities['goog:chromeOptions'].args).toEqual([
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        expect.stringContaining('--use-file-for-fake-video-capture='),
      ]);
    });

    it('should log message for non-Chrome browsers', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const capabilities = {
        ...mockCapabilities,
        browserName: 'firefox',
      };

      service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Injecting camera source only supported in Chrome browsers (current browserName: firefox)',
      );
      expect(capabilities['goog:chromeOptions']).toBeUndefined();
    });

    it('should work with browserName containing "Chrome" (case insensitive)', () => {
      const capabilities = {
        browserName: 'Google Chrome',
        platformName: 'desktop',
      };

      service.onWorkerStart('test-cid', capabilities, [], {}, []);

      expect(capabilities['goog:chromeOptions']).toBeDefined();
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

    beforeEach(() => {
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

        expect(mockFs.readFileSync).not.toHaveBeenCalled();
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
    });
  });
});