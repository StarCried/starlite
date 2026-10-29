import type { DefaultAsset } from "./default-assets";
import type { HexoWidgetConfig } from "./types";

export const BLUEFISH_VERSION = "bluefish-v1.0.0-starlite.1";
const release = `https://github.com/StarCried/starlite/releases/download/${BLUEFISH_VERSION}`;
// Local candidate pins. The separately licensed assets must be published before
// shipping this selection; local QA seeds this exact verified cache instead.
export const BLUEFISH_ASSETS: readonly DefaultAsset[] = [
  {file:"BlueFish-StarLite.vrm",url:`${release}/BlueFish-StarLite.vrm`,bytes:9990468,sha256:"c94b0a9e06503feadd002cc0dd167edb6bf9d73e9346265594cf0d7cf3260710"},
  {file:"LICENSE-BlueFish.md",url:`${release}/LICENSE-BlueFish.md`,bytes:2490,sha256:"c6b6bfcd77cfa5caec91378226526e797da610d43e8723b186a8049be573f70d"},
  {file:"ASSET-SOURCES.md",url:`${release}/ASSET-SOURCES.md`,bytes:2512,sha256:"e3d0e7fa55938cab09c9589c081c15eeffdf2f33117bfdaae6a5cc883b8b5205"},
];

/** Generic StarLite Idle/gaze/blink; no Weiguang motion or character dialogue. */
export const BLUEFISH_PRESET = {
  backend: "vrm",
  mobile: { show: false, breakpoint: 900 },
  render: { fps: 60, maxDevicePixelRatio: 1, fitPadding: 0.92 },
  camera: { yawDegrees: 0, pitchDegrees: 5, fovDegrees: 20, targetHeight: 0.54 },
  display: { width: 260, height: 390 },
  gaze: { maxYawDegrees: 25, maxPitchDegrees: 15, smoothingMs: 100 },
  interactions: { pointer: true, passThrough: true, drag: false },
  dialogue: {
    enter: { delayMs: 500, durationMs: 6300, lines: ["你好呀，欢迎来这里。"] },
    click: { durationMs: 6300, lines: ["我在呢。", "慢慢看，不着急。", "今天有什么新发现？"] },
    idle: { durationMs: 9000, intervalMinMs: 60000, intervalMaxMs: 120000,
      lines: ["专注一会儿，也记得休息一下。", "我就在这里，陪你慢慢看。"] },
  },
} satisfies HexoWidgetConfig;
