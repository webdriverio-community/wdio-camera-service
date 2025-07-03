import { browser, $ } from '@wdio/globals';

describe('CameraService', () => {
  it('should inject a barcode image', async () => {
    await browser.url('https://webcamtests.com/');

    await $('p=Consent').click();

    await $('#webcam-launcher').click();

    // eslint-disable-next-line wdio/no-pause
    await browser.pause(5_000);
  });

  it('should inject a dudes image', async () => {
    await browser.url('https://webcamtests.com/');
    await browser.changeCameraSource('camera/wednesday.mjpeg');

    await $('#webcam-launcher').click();

    // eslint-disable-next-line wdio/no-pause
    await browser.pause(5_000);
  });
});

