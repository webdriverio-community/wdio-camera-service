import type { Options, Services } from '@wdio/types';
import { SevereServiceError } from 'webdriverio';
import fs from 'node:fs';
import path from 'node:path';
import { FormatConverter, requiresConversion } from './format-converter.js';
import { checkFfmpegAvailability, getInstallationInstructions } from './ffmpeg-checker.js';
import { FfmpegNotFoundError } from './errors.js';

export interface CameraServiceOptions {
  defaultCameraFeed: string;
  videoDirectory: string;
  imageFrameRate?: number;
  imageDuration?: number;
  ffmpegPath?: string;
  cacheEnabled?: boolean;
  outputFormat?: 'mjpeg' | 'y4m';
}

export default class CameraService implements Services.ServiceInstance {
  private browser: WebdriverIO.Browser | undefined;
  private androidVideoDirectory: string = '/storage/emulated/0/Android/data/com.android.chrome/files/Download';
  private converter: FormatConverter | undefined;
  private convertedDefaultFeed: string | undefined;
  private readonly needsConversion: boolean;

  constructor(private readonly _options: CameraServiceOptions) {
    if (!this._options.videoDirectory || !this._options.defaultCameraFeed) {
      throw new SevereServiceError('Please configure default camera feed path (/path/to/default.mjpeg) and video directory!');
    }
    this.needsConversion = requiresConversion(this._options.defaultCameraFeed);
  }

  async onPrepare(): Promise<void> {
    if (!fs.existsSync(this._options.videoDirectory)) {
      fs.mkdirSync(this._options.videoDirectory, { recursive: true });
    }

    // Check FFmpeg availability if conversion will be needed
    if (this.needsConversion) {
      const ffmpegStatus = await checkFfmpegAvailability(this._options.ffmpegPath);
      if (!ffmpegStatus.available) {
        const instructions = getInstallationInstructions();
        throw new FfmpegNotFoundError(
          `FFmpeg is required to convert ${this._options.defaultCameraFeed} but was not found.\n\n${instructions}`,
        );
      }
    }

    // Initialize the converter
    this.converter = new FormatConverter({
      videoDirectory: this._options.videoDirectory,
      ffmpegPath: this._options.ffmpegPath,
      cacheEnabled: this._options.cacheEnabled,
      imageFrameRate: this._options.imageFrameRate,
      imageDuration: this._options.imageDuration,
      outputFormat: this._options.outputFormat,
    });
    await this.converter.initialize();

    // Pre-convert the default feed if needed
    if (this.needsConversion) {
      this.convertedDefaultFeed = await this.converter.convert(this._options.defaultCameraFeed);
    }
  }

  async onWorkerStart(
    cid: string,
    capabilities: WebdriverIO.Capabilities,
    _specs: string[],
    _args: Options.Testrunner,
    _execArgv: string[],
  ): Promise<void> {
    if (capabilities.browserName?.toLowerCase().includes('chrom')) {
      // Use converted feed if available, otherwise use original
      const feedPath = this.convertedDefaultFeed ?? this._options.defaultCameraFeed;
      const baseFeed = fs.readFileSync(path.resolve(process.cwd(), feedPath));

      // Determine output extension based on format
      const outputExt = this._options.outputFormat === 'y4m' ? '.y4m' : '.mjpeg';
      let sessionVideoFilePath: string = path.resolve(process.cwd(), this._options.videoDirectory, `${cid}${outputExt}`);

      if (capabilities.platformName?.toLowerCase().includes('android')) {
        sessionVideoFilePath = path.resolve(this.androidVideoDirectory, `${cid}${outputExt}`);
      } else {
        fs.writeFileSync(sessionVideoFilePath, new Uint8Array(baseFeed));
      }

      const args = [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-video-capture=${sessionVideoFilePath}`,
      ];

      // Ensure chromeOptions and args array exist, then append camera args
      capabilities['goog:chromeOptions'] ??= {};
      capabilities['goog:chromeOptions'].args ??= [];
      capabilities['goog:chromeOptions'].args.push(...args);
    } else {
      console.log(`Injecting camera source only supported in Chrome browsers (current browserName: ${capabilities.browserName})`);
    }
  }

  async before(_config: object, _capabilities: object, browser: WebdriverIO.Browser) {
    this.browser = browser;

    // Initialize converter in worker process (needed because onPrepare runs in launcher process)
    if (!this.converter) {
      this.converter = new FormatConverter({
        videoDirectory: this._options.videoDirectory,
        ffmpegPath: this._options.ffmpegPath,
        cacheEnabled: this._options.cacheEnabled,
        imageFrameRate: this._options.imageFrameRate,
        imageDuration: this._options.imageDuration,
        outputFormat: this._options.outputFormat,
      });
      await this.converter.initialize();
    }

    const converter = this.converter;

    this.browser.addCommand(
      'changeCameraSource',
      async (videoPath: string) => {
        const isChrome = this.browser?.capabilities.browserName?.toLowerCase().includes('chrome');
        const isAndroid = this.browser?.capabilities.platformName?.toLowerCase().includes('android');

        const cameraSourceMatch = (this.browser?.requestedCapabilities['goog:chromeOptions']?.args as string[])
          ?.find((arg) => arg.includes('--use-file-for-fake-video-capture'))
          ?.match(/--use-file-for-fake-video-capture=(\S+)/);

        const cameraSource = cameraSourceMatch ? cameraSourceMatch[1] : undefined;

        if (cameraSource) {
          const defaultCameraFeedPath = path.resolve(cameraSource);
          let sourceCameraFeedPath = path.resolve(process.cwd(), videoPath);

          if (!fs.existsSync(sourceCameraFeedPath)) {
            throw new Error(`New source camera feed ${sourceCameraFeedPath} does not exist`);
          }

          // Convert if needed (video/image formats require FFmpeg conversion)
          if (requiresConversion(sourceCameraFeedPath)) {
            if (!converter) {
              throw new Error('Format converter not initialized. Ensure onPrepare was called.');
            }
            sourceCameraFeedPath = await converter.convert(videoPath);
          }

          if (!isChrome) {
            return;
          }

          const mockedVideo = fs.readFileSync(sourceCameraFeedPath);

          if (isAndroid) {
            const encoded = Buffer.from(mockedVideo).toString('base64');
            await this.browser?.pushFile(defaultCameraFeedPath, encoded);
          } else {
            if (!fs.existsSync(defaultCameraFeedPath)) {
              throw new Error(`Default camera feed ${defaultCameraFeedPath} does not exist`);
            }
            fs.writeFileSync(defaultCameraFeedPath, new Uint8Array(mockedVideo));
          }
        }
      },
    );
  }
}
