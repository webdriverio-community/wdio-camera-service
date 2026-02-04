import CameraService from '../services/camera.service.js';

export default CameraService;
export const launcher = CameraService;

export type { CameraServiceOptions } from '../services/camera.service.js';

declare global {
  namespace WebdriverIO {
    interface Browser {
      changeCameraSource: (videoFilePath: string) => Promise<void>;
    }
  }
}
