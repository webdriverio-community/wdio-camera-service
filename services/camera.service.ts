import type { Options, Services } from '@wdio/types';
import { SevereServiceError } from 'webdriverio';
import fs from 'node:fs';
import path from 'node:path';

interface CameraServiceOptions {
  defaultCameraFeed: string;
  videoDirectory: string;
}

export default class CameraService implements Services.ServiceInstance {
  private browser: WebdriverIO.Browser | undefined;
  private androidVideoDirectory: string = '/storage/emulated/0/Android/data/com.android.chrome/files/Download';

  constructor(private readonly _options: CameraServiceOptions) {
    if (!this._options.videoDirectory || !this._options.defaultCameraFeed) {
      throw new SevereServiceError('Please configure default camera feed path (/path/to/default.mjpeg) and video directory!');
    }
  }

  onPrepare() {
    if (!fs.existsSync(this._options.videoDirectory)) {
      fs.mkdirSync(this._options.videoDirectory, { recursive: true });
    }
  }

  onWorkerStart(
    cid: string,
    capabilities: WebdriverIO.Capabilities,
    _specs: string[],
    _args: Options.Testrunner,
    _execArgv: string[],
  ): void {
    if (capabilities.browserName?.toLowerCase().includes('chrom')) {
      const baseFeed = fs.readFileSync(path.resolve(process.cwd(), this._options.defaultCameraFeed));
      let sessionVideoFilePath: string = path.resolve(process.cwd(), this._options.videoDirectory, `${cid}.mjpeg`);

      if (capabilities.platformName?.toLowerCase().includes('android')) {
        sessionVideoFilePath = path.resolve(this.androidVideoDirectory, `${cid}.mjpeg`);
      } else {
        fs.writeFileSync(sessionVideoFilePath, new Uint8Array(baseFeed));
      }

      const args = [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-video-capture=${sessionVideoFilePath}`,
      ];

      if (capabilities['goog:chromeOptions']) {
        // chromeOptions exists
        if (capabilities['goog:chromeOptions'].args) {
          // Both chromeOptions and args exist - pushing to existing args
          capabilities['goog:chromeOptions'].args.push(...args);
        } else {
          // chromeOptions exists but no args - adding args array
          capabilities['goog:chromeOptions'].args = args;
        }
      } else {
        // No chromeOptions - creating the whole object
        capabilities['goog:chromeOptions'] = { args };
      }
    } else {
      console.log(`Injecting camera source only supported in Chrome browsers (current browserName: ${capabilities.browserName})`);
    }
  }

  before(_config: object, _capabilities: object, browser: WebdriverIO.Browser) {
    this.browser = browser;
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
          const sourceCameraFeedPath = path.resolve(process.cwd(), videoPath);
          if (!fs.existsSync(sourceCameraFeedPath)) {
            throw new Error(`New source camera feed ${sourceCameraFeedPath} does not exist`);
          }
          if (isChrome && !isAndroid) {
            if (!fs.existsSync(defaultCameraFeedPath)) {
              throw new Error(`Default camera feed ${defaultCameraFeedPath} does not exist`);
            }

            const mockedVideo = fs.readFileSync(sourceCameraFeedPath);
            fs.writeFileSync(defaultCameraFeedPath, new Uint8Array(mockedVideo));
          } else if (isChrome && isAndroid) {
            const mockedVideo = fs.readFileSync(sourceCameraFeedPath);
            const encoded = Buffer.from(mockedVideo).toString('base64');
            await this.browser?.pushFile(defaultCameraFeedPath, encoded);
          }
        }
      },
    );
  }
}