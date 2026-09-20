import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from "three";
import type { AnimationPlaybackOptions, AnimationPlaybackResult } from "model-widget-core";

/** One real clip at a time. Names never synthesize a missing animation. */
export class VrmAnimationPlayer {
  readonly mixer: AnimationMixer;
  readonly #clips: ReadonlyMap<string, AnimationClip>;
  readonly #restore: () => void;
  #active: { name: string; action: AnimationAction; promise: Promise<AnimationPlaybackResult>; resolve: (result: AnimationPlaybackResult) => void } | undefined;
  #finished = false;
  constructor(root: Object3D, clips: ReadonlyMap<string, AnimationClip>, restore: () => void) {
    this.mixer = new AnimationMixer(root); this.#clips = clips; this.#restore = restore;
    this.mixer.addEventListener("finished", (event) => { if (event.action === this.#active?.action) this.#finished = true; });
  }
  get activeName(): string | undefined { return this.#active?.name; }
  get hasLookAtTrack(): boolean { return this.#clips.get(this.#active?.name ?? "")?.tracks.some((track) => track.name.includes("LookAt")) ?? false; }
  get hasBlinkTrack(): boolean { return this.#clips.get(this.#active?.name ?? "")?.tracks.some((track) => /VRMExpression_blink(?:Left|Right)?\.weight$/.test(track.name)) ?? false; }
  play(name: string, options: AnimationPlaybackOptions = {}): Promise<AnimationPlaybackResult> {
    const clip = this.#clips.get(name);
    if (!clip) return Promise.reject(new Error(`animation does not exist: ${name}`));
    if (this.#active?.name === name && !options.restart) return this.#active.promise;
    this.stop("interrupted");
    const action = this.mixer.clipAction(clip).reset();
    action.setLoop(options.mode === "loop" ? LoopRepeat : LoopOnce, options.mode === "loop" ? Infinity : 1);
    action.clampWhenFinished = true;
    let resolve!: (result: AnimationPlaybackResult) => void;
    const promise = new Promise<AnimationPlaybackResult>((done) => { resolve = done; });
    this.#active = { name, action, promise, resolve };
    action.play(); this.mixer.update(0);
    return promise;
  }
  update(delta: number): void {
    this.mixer.update(delta);
    if (this.#finished) this.stop("completed");
  }
  stop(result: AnimationPlaybackResult = "stopped"): void {
    const active = this.#active;
    this.#active = undefined; this.#finished = false;
    this.mixer.stopAllAction(); this.#restore();
    active?.resolve(result);
  }
  destroy(): void { this.stop(); this.mixer.uncacheRoot(this.mixer.getRoot()); }
}
