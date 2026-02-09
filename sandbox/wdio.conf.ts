export const config: WebdriverIO.Config = {

  tsConfigPath: './tsconfig.json',
  specs: [
    './test/specs/**/camera.e2e.ts',
  ],
  // Patterns to exclude.
  exclude: [
    // 'path/to/excluded/files'
  ],

  maxInstances: 1,

  capabilities: [{
    browserName: 'chrome',
    'goog:chromeOptions': {
      // args: ['--disable-gpu', '--headless=new', '--disable-dev-shm-usage'],
      args: ['--headless=new', '--disable-dev-shm-usage'],
    },
  }],

  logLevel: 'warn',

  bail: 0,

  waitforTimeout: 10000,

  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    ['visual', {}],
    ['camera', {
      defaultCameraFeed: './camera/default.mjpeg',
      videoDirectory: './camera/video',
    }],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  injectGlobals: true,
};
