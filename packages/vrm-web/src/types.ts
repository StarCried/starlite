import type { ModelController } from "model-widget-core";
export type { ModelController, AnimationPlaybackResult, AnimationPlaybackOptions } from "model-widget-core";
export interface VrmAnimationSource { name: string; url: string; durationMs?: number }
export interface BonePose { rotation: [number, number, number, number]; position?: [number, number, number] }
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
  model: string;
  fallback: string;
  animations?: readonly VrmAnimationSource[];
  profile?: CharacterProfile | string;
  display?: { width?: number; height?: number };
  render?: { fps?: number; maxDevicePixelRatio?: number; initialScale?: number; autoFit?: boolean; fitPadding?: number };
  camera?: { yawDegrees?: number; pitchDegrees?: number; fovDegrees?: number; targetHeight?: number };
  gaze?: { maxYawDegrees?: number; maxPitchDegrees?: number; smoothingMs?: number };
  mobile?: { show?: boolean; breakpoint?: number };
  network?: { requestTimeoutMs?: number; modelMaxBytes?: number };
  interactions?: { pointer?: boolean; click?: false | { animation?: string; animations?: readonly string[] }; drag?: boolean };
  ambient?: { animations?: readonly string[] };
  dialogue?: {
    enter?: false | { animation: string; animations?: readonly string[]; lines: readonly string[]; durationMs?: number; delayMs?: number };
    idle?: false | { animation: string; animations?: readonly string[]; lines: readonly string[]; durationMs?: number; intervalMinMs?: number; intervalMaxMs?: number };
    click?: false | { animation: string; animations?: readonly string[]; lines: readonly string[]; durationMs?: number };
  };
}
export interface VrmDiagnostics {
  renderedFrames: number; frameTimesMs: number[]; renderCostsMs: number[];
  calls: number; triangles: number; geometries: number; textures: number;
  renderer: string; loadMs: number;
  activeAnimation?: string | null;
  gaze?: { yawDegrees: number; pitchDegrees: number; headYawDegrees: number; headPitchDegrees: number };
  framing?: { distance: number; maxAbsX: number; maxAbsY: number };
}
export interface VrmController extends ModelController {
 diagnostics(): VrmDiagnostics;
 captureFrame(): string;
 getExpressions(): readonly string[];
 setExpression(name: string, weight: number): void;
}
