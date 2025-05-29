import {Testrunner} from '@wdio/types/build/Options';
import {Services} from '@wdio/types';
import {SevereServiceError} from 'webdriverio';
import fs from 'node:fs';
import path from 'node:path';

interface CameraServiceOptions {
  defaultCameraFeed: string;
  videoDirectory: string;
}

export default class CameraService implements Services.ServiceInstance {
  private browser: WebdriverIO.Browser | undefined;

  constructor(private readonly _options: CameraServiceOptions) {
    if (!this._options.videoDirectory || !this._options.defaultCameraFeed) {
      throw new SevereServiceError('Please configure default camera feed path (/path/to/default.mjpeg) and video directory!');
    }
  }

  async onPrepare() {
    if (!fs.existsSync(this._options.videoDirectory)) {
      fs.mkdirSync(this._options.videoDirectory, {recursive: true});
    }
  }

  onWorkerStart(
    cid: string,
    capabilities: WebdriverIO.Capabilities,
    _specs: string[],
    _args: Testrunner,
    _execArgv: string[],
  ): void {
    const baseFeed = fs.readFileSync(path.resolve(process.cwd(), this._options.defaultCameraFeed));
    const sessionVideoFilePath: string = path.resolve(process.cwd(), this._options.videoDirectory, `${cid}.mjpeg`);

    fs.writeFileSync(sessionVideoFilePath, new Uint8Array(baseFeed));

    if (capabilities['goog:chromeOptions']?.args) {
      capabilities['goog:chromeOptions'].args.push(`--use-file-for-fake-video-capture=${sessionVideoFilePath}`);
    } else {
      capabilities['goog:chromeOptions'] = {
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          `--use-file-for-fake-video-capture=${sessionVideoFilePath}`
        ]
      }
    }
  }

  before(_config: object, _capabilities: object, browser: WebdriverIO.Browser) {
    this.browser = browser;
    this.browser.addCommand(
      'changeCameraSource',
      async function (videoPath: string) {
        // @ts-ignore
        const cameraSourceMatch = (this.requestedCapabilities['goog:chromeOptions']?.args as string[])
          ?.find((arg) => arg.includes('--use-file-for-fake-video-capture'))
          ?.match(/--use-file-for-fake-video-capture=(\S+)/);

        const cameraSource = cameraSourceMatch ? cameraSourceMatch[1] : undefined;

        if (cameraSource) {
          const defaultCameraFeedPath = path.resolve(cameraSource);
          if (!fs.existsSync(defaultCameraFeedPath)) {
            throw new Error(`Default camera feed ${defaultCameraFeedPath} does not exist`);
          }

          const sourceCameraFeedPath = path.resolve(process.cwd(), videoPath);
          if (!fs.existsSync(sourceCameraFeedPath)) {
            throw new Error(`New source camera feed ${sourceCameraFeedPath} does not exist`);
          }

          const mockedVideo = fs.readFileSync(sourceCameraFeedPath);
          fs.writeFileSync(defaultCameraFeedPath, new Uint8Array(mockedVideo));

          // @ts-ignore
          await this.refresh();
        }
      },
    );
  }
}