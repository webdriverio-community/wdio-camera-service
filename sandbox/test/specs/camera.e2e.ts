import { $, browser } from '@wdio/globals';

describe('CameraService', () => {
  before(async () => {
    await browser.url('https://webcamtests.com/');
    await $('p=Consent').click();
  });

  beforeEach(async () => {
    await browser.url('https://webcamtests.com/');
  });

  it('should inject a barcode image by default', async () => {
    await $('#webcam-launcher').click();

    // eslint-disable-next-line wdio/no-pause
    await browser.pause(2_000);

    await expect($('video')).toMatchElementSnapshot('defaultBarcode', 1);
  });

  it('should inject a dudes image', async () => {
    await browser.changeCameraSource('camera/wednesday.mjpeg');
    await $('#webcam-launcher').click();

    // eslint-disable-next-line wdio/no-pause
    await browser.pause(2_000);

    await expect($('video')).toMatchElementSnapshot('wednesdayCamera', 10, {
      removeElements: [await $('.box-middle iframe').getElement()],
    });
  });

  it('should loop a PNG image', async () => {
    await browser.changeCameraSource('camera/wdio.png');
    await $('#webcam-launcher').click();

    // eslint-disable-next-line wdio/no-pause
    await browser.pause(2_000);

    await expect($('video')).toMatchElementSnapshot('pngCamera', 1);
  });

  it('should inject a .mov video to camera', async () => {
    await browser.changeCameraSource('camera/wdio.mov');
    await $('#webcam-launcher').click();

    // eslint-disable-next-line wdio/no-pause
    await browser.pause(2_000);

    await expect($('video')).toMatchElementSnapshot('movCamera', 10, {
      removeElements: [await $('.box-middle iframe').getElement()],
    });
  });
});

