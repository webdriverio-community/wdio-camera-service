# WebdriverIO Camera Service

A WebdriverIO service that enables camera feed injection for testing
applications that use camera/video inputs. This service allows you to mock
camera feeds with pre-recorded video files during automated testing.

## Features

- 🎥 Inject custom video feeds into Chrome browsers during testing
- 🔄 Dynamically change camera sources during test execution
- 📁 Automatic video directory management
- 🔄 **Automatic format conversion** - Use MP4, WebM, PNG, JPG and more (requires FFmpeg)
- 💾 **Smart caching** - Converted files are cached to avoid re-conversion
- 🧪 Perfect for testing camera-dependent applications like QR code scanners,
  video conferencing, etc.

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

| Option              | Type                 | Required | Default    | Description                                        |
|---------------------|----------------------|----------|------------|----------------------------------------------------|
| `defaultCameraFeed` | string               | ✅        | -          | Path to the default video file                     |
| `videoDirectory`    | string               | ✅        | -          | Directory for session-specific video files         |
| `ffmpegPath`        | string               | ❌        | `'ffmpeg'` | Custom path to FFmpeg executable                   |
| `cacheEnabled`      | boolean              | ❌        | `true`     | Enable caching of converted files                  |
| `outputFormat`      | `'mjpeg'` \| `'y4m'` | ❌        | `'mjpeg'`  | Output format for converted files                  |

## Supported Formats

The service supports multiple input formats with automatic conversion:

### Native Formats (No Conversion)

- `.mjpeg` - Motion JPEG
- `.y4m` - YUV4MPEG2

### Video Formats (Requires FFmpeg)

- `.mp4` - MPEG-4 Video
- `.webm` - WebM Video
- `.avi` - AVI Video
- `.mov` - QuickTime Video
- `.gif` - GIF (animated or static)

### Image Formats (Requires FFmpeg)

Images are converted to a single-frame MJPEG (Chrome loops it automatically):

- `.png` - PNG Image
- `.jpg` / `.jpeg` - JPEG Image
- `.bmp` - Bitmap Image

## FFmpeg Requirement

FFmpeg is **only required** when using non-native formats (MP4, WebM, PNG, etc.).
If you only use `.mjpeg` or `.y4m` files, FFmpeg is not needed.

### Installing FFmpeg

**macOS:**

```bash
brew install ffmpeg
```

**Ubuntu/Debian:**

```bash
sudo apt-get install ffmpeg
```

**Windows:**

```bash
winget install FFmpeg
# or
choco install ffmpeg
```

Or download from: [ffmpeg.org](https://ffmpeg.org/download.html)

## Browser Support

- ✅ **Chrome/Chromium/Android Chrome** - Full support
- ❌ **Firefox** - Not supported
- ❌ **Safari** - Not supported
- ❌ **Edge** - Not supported (unless Chromium-based)

> **Note**: This service only works with Chrome/Chromium browsers as it relies
> on Chrome-specific command line arguments for camera mocking.

### Android SDK Supports (With Chrome)

| SDK | Version | Support? |
|-----|---------|----------|
| 31  | 12      | ✅        |
| 33  | 13      | ✅        |
| 34  | 14      | ✅        |
| 35  | 15      | ✅        |
| 36  | 16      | ✅        |

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

### Using Different Formats

You can use various formats as your default camera feed:

```typescript
// wdio.conf.ts
export const config: WebdriverIO.Config = {
  services: [
    ['camera', {
      // Use a PNG image as the default feed (Chrome loops it automatically)
      defaultCameraFeed: './camera/qr-code.png',
      videoDirectory: './camera/video',
    }],
  ],
};
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

    // Switch to a PNG image (automatically converted to video)
    await browser.changeCameraSource('path/to/qr-code.png');

    // Test QR code scanning
    await expect($('#qr-result')).toHaveText('QR Content');
  });
});
```

## File Structure

```text
project/
├── camera/
│   ├── default.mjpeg          # Default camera feed (MJPEG)
│   ├── qr-code.png            # QR code image (auto-converted)
│   ├── barcode-sample.mp4     # Barcode video (auto-converted)
│   └── video/                 # Auto-generated session videos
│       ├── 0-0.mjpeg         # Session-specific copies
│       └── .cache/           # Cached converted files
│           └── abc123.mjpeg  # Hash-based cache
├── test/
│   └── specs/
│       └── camera.e2e.ts     # Test files
└── wdio.conf.ts              # WebdriverIO configuration
```

## Video File Requirements

### Native Format (Recommended)

- **Format**: MJPEG (Motion JPEG) or Y4M
- **Extension**: `.mjpeg` or `.y4m`
- **Location**: Relative to your project root or absolute paths

### Other Formats

When using non-native formats, the service will automatically convert them using FFmpeg.
Converted files are cached in `videoDirectory/.cache/` to avoid repeated conversions.

### Creating MJPEG Files Manually

You can convert existing video files to MJPEG format using FFmpeg:

```bash
# Convert MP4 to MJPEG
ffmpeg -i input.mp4 -q:v 2 output.mjpeg

# Convert image to single-frame MJPEG
ffmpeg -i input.png -frames:v 1 -q:v 2 output.mjpeg
```

## API Reference

### Browser Commands

#### `browser.changeCameraSource(videoFilePath: string)`

Changes the active camera source to a different video file.

**Parameters:**

- `videoFilePath` (string): Path to the video/image file
  (relative to project root). Supports all formats listed above.

**Returns:** `Promise<void>`

**Example:**

```typescript
// Use MJPEG file (native)
await browser.changeCameraSource('camera/new-feed.mjpeg');

// Use MP4 file (auto-converted)
await browser.changeCameraSource('camera/video.mp4');

// Use PNG image (auto-converted to looping video)
await browser.changeCameraSource('camera/qr-code.png');
```

## Error Handling

The service will throw errors in the following cases:

- **Missing configuration**: When `defaultCameraFeed` or `videoDirectory`
  is not specified
- **File not found**: When the specified video file doesn't exist
- **FFmpeg not found**: When using non-native formats without FFmpeg installed
- **Conversion failed**: When FFmpeg fails to convert a file
- **Unsupported format**: When using an unrecognized file extension
- **Unsupported browser**: When used with non-Chrome browsers
  (logs warning instead of error)

### Error Types

| Error                    | Description                       |
|--------------------------|-----------------------------------|
| `FfmpegNotFoundError`    | FFmpeg required but not installed |
| `ConversionError`        | FFmpeg conversion failed          |
| `UnsupportedFormatError` | Unknown file extension            |

## Example Test Cases

```typescript
import { browser } from '@wdio/globals';

describe('Camera Application Tests', () => {
  it('should scan QR codes from image', async () => {
    await browser.url('https://qr-scanner-app.com');

    // Inject QR code image (auto-converted to video)
    await browser.changeCameraSource('camera/qr-code.png');

    await $('#start-camera').click();
    await expect($('#qr-result')).toHaveText('Expected QR Content');
  });

  it('should detect faces from video', async () => {
    await browser.url('https://face-detection-app.com');

    // Inject face video (MP4 auto-converted)
    await browser.changeCameraSource('camera/face.mp4');

    await $('#start-detection').click();
    await expect($('#face-count')).toHaveText('1 face detected');
  });
});
```

## Troubleshooting

### Common Issues

1. **"FFmpeg is required but not found"**
    - Install FFmpeg using your package manager
    - Or provide a custom path via `ffmpegPath` option

2. **"Default camera feed does not exist"**
    - Ensure the `defaultCameraFeed` path is correct
    - Verify the file exists and has proper permissions

3. **"New source camera feed does not exist"**
    - Check the path passed to `changeCameraSource()`
    - Verify the file exists

4. **"Unsupported format"**
    - Check the file extension is in the supported list
    - Ensure FFmpeg is installed for non-native formats

5. **Camera not working in browser**
    - Verify you're using Chrome/Chromium
    - Check browser console for permission errors
    - Ensure the test site allows camera access

### Debug Tips

- Set `logLevel: 'debug'` in your WebdriverIO config to see detailed logs
- Check the `videoDirectory/.cache/` for converted files
- Verify MJPEG files play correctly in media players
- Run `ffmpeg -version` to check FFmpeg installation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License—see LICENSE file for details
