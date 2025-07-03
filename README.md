# WebdriverIO Camera Service

A WebdriverIO service that enables camera feed injection for testing applications that use camera/video inputs. This service allows you to mock camera feeds with pre-recorded video files during automated testing.

## Features

- 🎥 Inject custom video feeds into Chrome browsers during testing
- 🔄 Dynamically change camera sources during test execution
- 📁 Automatic video directory management
- 🧪 Perfect for testing camera-dependent applications like QR code scanners, video conferencing, etc.

## Installation

```bash
npm install --save-dev wdio-camera-service
```

## Configuration

Add the camera service to your WebdriverIO configuration:

```typescript
// wdio.conf.ts
export const config: WebdriverIO.Config = {
  // ... other config
  services: [
    ['camera', {
      defaultCameraFeed: './camera/default.mjpeg',
      videoDirectory: './camera/video',
    }],
  ],
  // ... other config
};
```

### Service Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `defaultCameraFeed` | string | ✅ | Path to the default MJPEG video file to use as camera feed |
| `videoDirectory` | string | ✅ | Directory where session-specific video files will be stored |

## Browser Support

- ✅ **Chrome/Chromium** - Full support
- ❌ **Firefox** - Not supported
- ❌ **Safari** - Not supported
- ❌ **Edge** - Not supported (unless Chromium-based)

> **Note**: This service only works with Chrome/Chromium browsers as it relies on Chrome-specific command line arguments for camera mocking.

## Usage

### Basic Usage

The service automatically injects the default camera feed when the browser starts:

```typescript
describe('Camera Tests', () => {
  it('should use default camera feed', async () => {
    await browser.url('https://example.com/camera-app');
    // Your default camera feed is now active
  });
});
```

### Changing Camera Source

Use the `changeCameraSource` command to switch video feeds during test execution:

```typescript
describe('Camera Tests', () => {
  it('should change camera source dynamically', async () => {
    await browser.url('https://example.com/camera-app');
    
    // Start with default feed, then switch to a different video
    await browser.changeCameraSource('path/to/barcode-video.mjpeg');
    
    // Test barcode scanning functionality
    await expect($('#barcode-result')).toHaveText('123456789');
    
    // Switch to another video
    await browser.changeCameraSource('path/to/face-video.mjpeg');
    
    // Test face detection
    await expect($('#face-detected')).toBeDisplayed();
  });
});
```

## File Structure

```
project/
├── camera/
│   ├── default.mjpeg          # Default camera feed
│   ├── barcode-sample.mjpeg   # Sample barcode video
│   ├── face-sample.mjpeg      # Sample face video
│   └── video/                 # Auto-generated session videos
│       └── 0-0.mjpeg         # Session-specific copies
├── test/
│   └── specs/
│       └── camera.e2e.ts     # Test files
└── wdio.conf.ts              # WebdriverIO configuration
```

## Video File Requirements

- **Format**: MJPEG (Motion JPEG)
- **Extension**: `.mjpeg`
- **Location**: Relative to your project root or absolute paths

### Creating MJPEG Files

You can convert existing video files to MJPEG format using FFmpeg:

```bash
# Convert MP4 to MJPEG
ffmpeg -i input.mp4 -f mjpeg output.mjpeg

# Convert with specific settings
ffmpeg -i input.mp4 -vcodec mjpeg -q:v 2 -r 30 output.mjpeg
```

## API Reference

### Browser Commands

#### `browser.changeCameraSource(videoFilePath: string)`

Changes the active camera source to a different video file.

**Parameters:**
- `videoFilePath` (string): Path to the new MJPEG video file (relative to project root)

**Returns:** Promise<void>

**Example:**
```typescript
await browser.changeCameraSource('camera/new-feed.mjpeg');
```

## Error Handling

The service will throw errors in the following cases:

- **Missing configuration**: When `defaultCameraFeed` or `videoDirectory` is not specified
- **File not found**: When the specified video file doesn't exist
- **Unsupported browser**: When used with non-Chrome browsers (logs warning instead of error)

## Example Test Cases

```typescript
import { browser } from '@wdio/globals';

describe('Camera Application Tests', () => {
  it('should scan QR codes', async () => {
    await browser.url('https://qr-scanner-app.com');
    
    // Inject QR code video
    await browser.changeCameraSource('camera/qr-code.mjpeg');
    
    await $('#start-camera').click();
    await expect($('#qr-result')).toHaveText('Expected QR Content');
  });

  it('should detect faces', async () => {
    await browser.url('https://face-detection-app.com');
    
    // Inject face video
    await browser.changeCameraSource('camera/face.mjpeg');
    
    await $('#start-detection').click();
    await expect($('#face-count')).toHaveText('1 face detected');
  });
});
```

## Troubleshooting

### Common Issues

1. **"Default camera feed does not exist"**
    - Ensure the `defaultCameraFeed` path is correct
    - Verify the file exists and has proper permissions

2. **"New source camera feed does not exist"**
    - Check the path passed to `changeCameraSource()`
    - Ensure the file is in MJPEG format

3. **Camera not working in browser**
    - Verify you're using Chrome/Chromium
    - Check browser console for permission errors
    - Ensure the test site allows camera access

### Debug Tips

- Set `logLevel: 'debug'` in your WebdriverIO config to see detailed logs
- Check the `videoDirectory` for generated session files
- Verify MJPEG files play correctly in media players

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License—see LICENSE file for details