import CameraService from '../services/camera.service';
export default CameraService;
export const launcher = CameraService

declare global {
  namespace WebdriverIO {
    interface Browser {
      changeCameraSource: (videoFilePath: string) => Promise<void>;
    }
  }
}
