import type { DefaultAsset } from "./default-assets";
import type { HexoWidgetConfig } from "./types";

export const BLUEFISH_VERSION = "bluefish-v1.0.0-starlite.1";
const release = `https://github.com/StarCried/starlite/releases/download/${BLUEFISH_VERSION}`;
// Independently licensed, immutable release assets; no artwork ships in npm.
export const BLUEFISH_ASSETS: readonly DefaultAsset[] = [
  {file:"BlueFish-StarLite.vrm",url:`${release}/BlueFish-StarLite.vrm`,bytes:10427496,sha256:"896b9013642af427b475c4cd559ff9eb570a4cd543cc92e5418778560603e20b"},
  {file:"LICENSE-BlueFish.md",url:`${release}/LICENSE-BlueFish.md`,bytes:2490,sha256:"c6b6bfcd77cfa5caec91378226526e797da610d43e8723b186a8049be573f70d"},
  {file:"ASSET-SOURCES.md",url:`${release}/ASSET-SOURCES.md`,bytes:6070,sha256:"8b426d8269fd645ef1609a5e13a77548ffb3e6971336c10a27c0c1597fd271c8"},
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
  interactions: { pointer: true, passThrough: true, drag: true,
    click: { animations: ["StarLiteHappyWave", "StarLiteCuriousPeek"] } },
  dialogue: {
    enter: { animation: "StarLiteHappyWave", delayMs: 500, durationMs: 6300, lines: ["你好呀，欢迎来这里。"] },
    click: { durationMs: 6300, animations: ["StarLiteHappyWave", "StarLiteCuriousPeek"], linesByAnimation: {
      StarLiteHappyWave: ["我在呢。", "你好呀！慢慢看，不着急。"],
      StarLiteCuriousPeek: ["今天有什么新发现？", "让我也看看。"],
    } },
    idle: { durationMs: 9000, intervalMinMs: 60000, intervalMaxMs: 120000,
      animations: ["StarLiteCuriousPeek", "StarLiteSleepyStartle"], linesByAnimation: {
        StarLiteCuriousPeek: ["在看什么呢？", "我就在这里，陪你慢慢看。"],
        StarLiteSleepyStartle: ["唔……我醒着呢。", "专注一会儿，也记得休息一下。"],
      } },
  },
} satisfies HexoWidgetConfig;
