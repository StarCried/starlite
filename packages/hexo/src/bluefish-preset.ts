import type { DefaultAsset } from "./default-assets";
import type { HexoWidgetConfig } from "./types";

export const BLUEFISH_VERSION = "bluefish-v1.0.0-starlite.1";
const release = `https://github.com/StarCried/starlite/releases/download/${BLUEFISH_VERSION}`;
// Local candidate pins. The separately licensed assets must be published before
// shipping this selection; local QA seeds this exact verified cache instead.
export const BLUEFISH_ASSETS: readonly DefaultAsset[] = [
  {file:"BlueFish-StarLite.vrm",url:`${release}/BlueFish-StarLite.vrm`,bytes:10427464,sha256:"da1696afb88e7d61f3b306cbb60e5bcba6780dc1b003f757e04a2612f423d3c3"},
  {file:"LICENSE-BlueFish.md",url:`${release}/LICENSE-BlueFish.md`,bytes:2490,sha256:"c6b6bfcd77cfa5caec91378226526e797da610d43e8723b186a8049be573f70d"},
  {file:"ASSET-SOURCES.md",url:`${release}/ASSET-SOURCES.md`,bytes:5075,sha256:"b1bfb419af5382e728b0876e22aa9a8c4610bc15261e39a2f524a3796c99fe7e"},
];

/** Accepted BlueFish motions and its own dialogue; standard gaze and blink. */
export const BLUEFISH_PRESET = {
  backend: "vrm",
  neutralAnimation: "StarLiteIdle",
  embeddedAnimations: ["Idle", "CuriousPeek", "HappyWave", "SleepyStartle"],
  ambient: { animations: ["StarLiteIdle"] },
  adjustments: { idle: { wristLiftDegrees: 30 }, gaze: { headStrength: 2 } },
  mobile: { show: false, breakpoint: 900 },
  render: { fps: 60, maxDevicePixelRatio: 1, fitPadding: 0.92 },
  camera: { yawDegrees: 0, pitchDegrees: 5, fovDegrees: 20, targetHeight: 0.54 },
  display: { width: 260, height: 390 },
  gaze: { maxYawDegrees: 25, maxPitchDegrees: 15, smoothingMs: 100 },
  interactions: { pointer: true, passThrough: true, drag: false,
    click: { animations: ["HappyWave", "CuriousPeek"] } },
  dialogue: {
    enter: { animation: "HappyWave", delayMs: 500, durationMs: 6300, lines: ["你好呀，欢迎来这里。"] },
    click: { durationMs: 6300, animations: ["HappyWave", "CuriousPeek"], linesByAnimation: {
      HappyWave: ["我在呢。", "你好呀！慢慢看，不着急。"],
      CuriousPeek: ["今天有什么新发现？", "让我也看看。"],
    } },
    idle: { durationMs: 9000, intervalMinMs: 60000, intervalMaxMs: 120000,
      animations: ["CuriousPeek", "SleepyStartle"], linesByAnimation: {
        CuriousPeek: ["在看什么呢？", "我就在这里，陪你慢慢看。"],
        SleepyStartle: ["唔……我醒着呢。", "专注一会儿，也记得休息一下。"],
      } },
  },
} satisfies HexoWidgetConfig;
