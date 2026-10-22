import type { DialogueSceneConfig, ModelController, PerformanceConfig } from "@starcried/starlite-core";
export type { ModelController, AnimationPlaybackResult, AnimationPlaybackOptions } from "@starcried/starlite-core";
export interface VrmAnimationSource { name: string; url: string; durationMs?: number }
export interface BonePose { rotation: [number, number, number, number]; position?: [number, number, number] }
/** Per-model calibration. Omitted values preserve the original pose and gaze. */
export interface ModelAdjustments {
  idle?: {
    armLiftDegrees?: number;
    palmTwistDegrees?: number;
    wristLiftDegrees?: number;
    /** 0 opens mapped fingers; 1 closes them. Omit to keep the authored hands. */
    handCurl?: number;
    elbowBendDegrees?: number;
  };
  gaze?: { headStrength?: number; eyeStrength?: number; smoothingMs?: number };
}
/** Data only: imported profiles cannot execute scripts. All rotations use glTF coordinates. */
export interface CharacterProfile {
  schemaVersion: 1;
  type: "weiguang";
  neutralPose: Record<string, BonePose>;
  neutralAnimation?: string;
  expressions: Record<string, { expression: string; blink?: string }>;
  earPoses: Record<string, Record<string, BonePose>>;
  earBones: string[];
  accessories: { collar: string; cone: string; collarVisible: boolean; coneVisible: boolean };
  blink: { period: number; curve: [number, number][] };
}
export interface VrmWidgetConfig {
  backend?: "vrm";
  adjustments?: ModelAdjustments;
  performance?: PerformanceConfig;
  model: string;
  fallback: string;
  animations?: readonly VrmAnimationSource[];
  /** Names returned by inspectVrm for animations embedded in the model. */
  embeddedAnimations?: readonly string[];
  /** Initial sample used as the relaxed pose when playback is stopped. */
  neutralAnimation?: string;
  profile?: CharacterProfile | string;
  display?: { width?: number; height?: number };
  render?: { fps?: number | "display"; maxDevicePixelRatio?: number; initialScale?: number; autoFit?: boolean; fitPadding?: number;
    /** Fixed CSS pixel margins; when supplied, animation never resizes the canvas. */
    viewportPadding?: { left: number; top: number; right: number; bottom: number } };
  camera?: { yawDegrees?: number; pitchDegrees?: number; fovDegrees?: number; targetHeight?: number };
  gaze?: { maxYawDegrees?: number; maxPitchDegrees?: number; smoothingMs?: number };
  mobile?: { show?: boolean; breakpoint?: number };
  network?: { requestTimeoutMs?: number; modelMaxBytes?: number };
  interactions?: { pointer?: boolean; click?: false | { animation?: string; animations?: readonly string[] }; drag?: boolean;
    /** Observe native page clicks without intercepting them; incompatible with drag. */
    passThrough?: boolean };
  ambient?: { animations?: readonly string[] };
  dialogue?: {
    enter?: false | (DialogueSceneConfig & { delayMs?: number });
    idle?: false | (DialogueSceneConfig & { intervalMinMs?: number; intervalMaxMs?: number });
    click?: false | DialogueSceneConfig;
  };
}
export interface ModelViewport {
  left: number; top: number; width: number; height: number; baseWidth: number; baseHeight: number;
}
export interface VrmDiagnostics {
  renderedFrames: number; frameTimesMs: number[]; renderCostsMs: number[];
  calls: number; triangles: number; geometries: number; textures: number;
  renderer: string; loadMs: number;
  activeAnimation?: string | null;
  gaze?: { yawDegrees: number; pitchDegrees: number; headYawDegrees: number; headPitchDegrees: number };
  framing?: { distance: number; maxAbsX: number; maxAbsY: number; viewport: ModelViewport };
  springPose?: readonly { name: string; rotation: [number, number, number, number] }[];
}
export interface VrmController extends ModelController {
 setModelAdjustments(adjustments: ModelAdjustments): void;
 diagnostics(): VrmDiagnostics;
 captureFrame(): string;
 getExpressions(): readonly string[];
 setExpression(name: string, weight: number): void;
}
