import CameraService from '../src/camera.service';
export default CameraService;

declare global {
  namespace WebdriverIO {
    interface Browser {
      changeCameraSource: (videoFilePath: string) => Promise<void>;
    }
  }
}
