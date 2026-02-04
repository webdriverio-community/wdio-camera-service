import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist the mock function so it's available during vi.mock hoisting
const mockExecAsync = vi.hoisted(() => vi.fn());

// Mock the modules
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

// Import after mocking
import { checkFfmpegAvailability, getInstallationInstructions } from './ffmpeg-checker.js';

describe('ffmpeg-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkFfmpegAvailability', () => {
    it('should return available=true when FFmpeg is found', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers',
        stderr: '',
      });

      const result = await checkFfmpegAvailability();

      expect(result.available).toBe(true);
      expect(result.path).toBe('ffmpeg');
      expect(result.version).toBe('6.0');
      expect(result.error).toBeNull();
    });

    it('should parse version from stderr if stdout is empty', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: '',
        stderr: 'ffmpeg version 5.1.2 Copyright (c) 2000-2023 the FFmpeg developers',
      });

      const result = await checkFfmpegAvailability();

      expect(result.available).toBe(true);
      expect(result.version).toBe('5.1.2');
    });

    it('should return available=false when FFmpeg is not found', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Command not found: ffmpeg'));

      const result = await checkFfmpegAvailability();

      expect(result.available).toBe(false);
      expect(result.path).toBeNull();
      expect(result.version).toBeNull();
      expect(result.error).toContain('Command not found');
    });

    it('should use custom path when provided', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'ffmpeg version 6.0',
        stderr: '',
      });

      const result = await checkFfmpegAvailability('/custom/path/ffmpeg');

      expect(result.available).toBe(true);
      expect(result.path).toBe('/custom/path/ffmpeg');
      expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('/custom/path/ffmpeg'));
    });

    it('should handle version output without parseable version string', async () => {
      mockExecAsync.mockResolvedValueOnce({
        stdout: 'some unexpected output',
        stderr: '',
      });

      const result = await checkFfmpegAvailability();

      expect(result.available).toBe(true);
      expect(result.version).toBeNull();
    });
  });

  describe('getInstallationInstructions', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
    });

    it('should return macOS instructions for darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const instructions = getInstallationInstructions();

      expect(instructions).toContain('brew install ffmpeg');
    });

    it('should return Linux instructions for linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const instructions = getInstallationInstructions();

      expect(instructions).toContain('apt-get install ffmpeg');
      expect(instructions).toContain('dnf install ffmpeg');
      expect(instructions).toContain('pacman -S ffmpeg');
    });

    it('should return Windows instructions for win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const instructions = getInstallationInstructions();

      expect(instructions).toContain('winget install FFmpeg');
      expect(instructions).toContain('choco install ffmpeg');
    });

    it('should return generic instructions for unknown platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });

      const instructions = getInstallationInstructions();

      expect(instructions).toContain('ffmpeg.org/download.html');
    });
  });
});
