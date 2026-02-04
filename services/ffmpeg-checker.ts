import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface FfmpegAvailability {
  available: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
}

/**
 * Check if FFmpeg is available on the system
 * @param customPath - Optional custom path to FFmpeg executable
 */
export async function checkFfmpegAvailability(customPath?: string): Promise<FfmpegAvailability> {
  const ffmpegPath = customPath ?? 'ffmpeg';

  try {
    const { stdout, stderr } = await execAsync(`"${ffmpegPath}" -version`);
    const output = stdout || stderr;

    // Parse version from output (e.g., "ffmpeg version 6.0 ...")
    const versionMatch = output.match(/ffmpeg version (\S+)/);
    const version = versionMatch ? versionMatch[1] : null;

    return {
      available: true,
      path: ffmpegPath,
      version,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      path: null,
      version: null,
      error: errorMessage,
    };
  }
}

/**
 * Get platform-specific FFmpeg installation instructions
 */
export function getInstallationInstructions(): string {
  const platform = process.platform;

  const instructions: Record<string, string> = {
    darwin: `FFmpeg is required but not found. Install it using:
  brew install ffmpeg

Or download from: https://ffmpeg.org/download.html`,

    linux: `FFmpeg is required but not found. Install it using:
  Ubuntu/Debian: sudo apt-get install ffmpeg
  Fedora: sudo dnf install ffmpeg
  Arch: sudo pacman -S ffmpeg

Or download from: https://ffmpeg.org/download.html`,

    win32: `FFmpeg is required but not found. Install it using:
  winget install FFmpeg
  OR
  choco install ffmpeg

Or download from: https://ffmpeg.org/download.html
After downloading, add the bin folder to your PATH.`,
  };

  return instructions[platform] ?? `FFmpeg is required but not found.
Download from: https://ffmpeg.org/download.html
Ensure ffmpeg is available in your PATH.`;
}
