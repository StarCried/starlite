import { AnimationMixer, AnimationClip, PropertyBinding, QuaternionKeyframeTrack, VectorKeyframeTrack, NumberKeyframeTrack, LoopOnce, LoopRepeat, type KeyframeTrack, type AnimationAction, type Object3D } from "three";
import type { AnimationPlaybackOptions, AnimationPlaybackResult } from "@starcried/starlite-core";

/** One semantic clip, with a short captured-pose transition on interruption. */
export class VrmAnimationPlayer {
  readonly mixer: AnimationMixer;
  readonly #clips: ReadonlyMap<string, AnimationClip>;
  readonly #restore: () => void;
  readonly #returnTo: string | undefined;
  readonly #lookAtClips = new Set<string>();
  readonly #blinkClips = new Set<string>();
  #active: { name: string; action: AnimationAction; promise: Promise<AnimationPlaybackResult>; resolve: (result: AnimationPlaybackResult) => void } | undefined;
  #finished = false;
  #transition: { clip: AnimationClip; action: AnimationAction; elapsed: number } | undefined;
  static readonly transitionSeconds = .4;
  constructor(root: Object3D, clips: ReadonlyMap<string, AnimationClip>, restore: () => void, returnTo?: string) {
    if (returnTo && !clips.has(returnTo)) throw new Error(`return animation does not exist: ${returnTo}`);
    this.mixer = new AnimationMixer(root); this.#restore = restore; this.#returnTo = returnTo;
    this.#clips = new Map([...clips].map(([name, clip]) => {
      if (clip.tracks.some(track => track.name.includes("LookAt"))) this.#lookAtClips.add(name);
      if (clip.tracks.some(track => /VRMExpression_blink(?:Left|Right)?\.weight$/.test(track.name))) this.#blinkClips.add(name);
      // Embedded glTF uses UUIDs while VRMA uses names for the same rig nodes.
      // Both actions and snapshots must share a binding key; otherwise two
      // PropertyMixers overwrite each other and restore a stale pose on exit.
      const tracks = clip.tracks.map(track => {
        const parsed = PropertyBinding.parseTrackName(track.name);
        const node = PropertyBinding.findNode(root, parsed.nodeName) as Object3D | null;
        if (!node) return track;
        const object = parsed.objectName ? "." + parsed.objectName + (parsed.objectIndex !== undefined ? "[" + parsed.objectIndex + "]" : "") : "";
        const canonical = node.uuid + object + "." + parsed.propertyName + (parsed.propertyIndex !== undefined ? "[" + parsed.propertyIndex + "]" : "");
        // A shallow track wrapper retains cubic interpolants and shares the
        // potentially large immutable time/value arrays with the source clip.
        return canonical === track.name ? track : Object.assign(Object.create(Object.getPrototypeOf(track)) as KeyframeTrack, track, { name: canonical });
      });
      return [name, new AnimationClip(clip.name, clip.duration, tracks, clip.blendMode)];
    }));
    this.mixer.addEventListener("finished", (event) => { if (event.action === this.#active?.action) this.#finished = true; });
  }
  get activeName(): string | undefined { return this.#active?.name; }
  get isOneShot(): boolean { return this.#active?.action.loop === LoopOnce; }
  get hasLookAtTrack(): boolean { return this.#lookAtClips.has(this.#active?.name ?? ""); }
  get hasBlinkTrack(): boolean { return this.#blinkClips.has(this.#active?.name ?? ""); }
  play(name: string, options: AnimationPlaybackOptions = {}): Promise<AnimationPlaybackResult> {
    const clip = this.#clips.get(name);
    if (!clip) return Promise.reject(new Error(`animation does not exist: ${name}`));
    if (this.#active?.name === name && !options.restart) return this.#active.promise;
    const pose = this.#active ? this.#capturePose() : undefined;
    this.stop("interrupted");
    const action = this.mixer.clipAction(clip).reset().setEffectiveWeight(1);
    action.setLoop(options.mode === "loop" ? LoopRepeat : LoopOnce, options.mode === "loop" ? Infinity : 1);
    action.clampWhenFinished = true;
    let resolve!: (result: AnimationPlaybackResult) => void;
    const promise = new Promise<AnimationPlaybackResult>((done) => { resolve = done; });
    this.#active = { name, action, promise, resolve };
    action.play();
    if (pose) {
      const outgoing = this.mixer.clipAction(pose);
      outgoing.setLoop(LoopOnce, 1); outgoing.clampWhenFinished = true;
      outgoing.setEffectiveWeight(1).play();
      action.setEffectiveWeight(0);
      this.#transition = { clip: pose, action: outgoing, elapsed: 0 };
    }
    this.mixer.update(0);
    return promise;
  }
  update(delta: number): void {
    if (this.#transition) {
      this.#transition.elapsed += delta;
      const t = Math.max(0, Math.min(1, this.#transition.elapsed / VrmAnimationPlayer.transitionSeconds));
      // Ease the blend at both ends without overshooting a bone's target pose.
      // This shapes the weights; the frozen snapshot does not retain velocity.
      const weight = t * t * (3 - 2 * t);
      this.#transition.action.setEffectiveWeight(1 - weight);
      this.#active?.action.setEffectiveWeight(weight);
    }
    this.mixer.update(delta);
    if (this.#transition && this.#transition.elapsed >= VrmAnimationPlayer.transitionSeconds) this.#clearTransition();
    if (this.#finished) {
      if (this.#returnTo) {
        // Finish at the authored endpoint, then capture it before starting Idle.
        // Restoring neutral first would erase the pose needed for the exit blend.
        this.#active?.resolve("completed");
        void this.play(this.#returnTo, { mode: "loop", restart: true });
      } else this.stop("completed");
    }
  }
  stop(result: AnimationPlaybackResult = "stopped"): void {
    const active = this.#active;
    this.#active = undefined; this.#finished = false;
    this.#clearTransition(); this.mixer.stopAllAction(); this.#restore();
    active?.resolve(result);
  }
  #capturePose(): AnimationClip {
    // Capture the currently mixed pose, including an interrupted transition.
    // Freezing this snapshot avoids a neutral-frame snap or unbounded outgoing
    // actions when DSH changes state several times inside the transition.
    const tracks = new Map<string, KeyframeTrack>();
    for (const clip of this.#clips.values()) {
      for (const source of clip.tracks) {
        if (tracks.has(source.name)) continue;
        const Track = source.ValueTypeName === "quaternion" ? QuaternionKeyframeTrack
          : source.ValueTypeName === "vector" ? VectorKeyframeTrack : NumberKeyframeTrack;
        const size = source.ValueTypeName === "quaternion" ? 4 : source.ValueTypeName === "vector" ? 3 : 1;
        const value = new Float32Array(size);
        const binding = new PropertyBinding(this.mixer.getRoot() as Object3D, source.name);
        // Three assigns this getter dynamically when the binding is bound;
        // its type declarations only expose bind/unbind.
        binding.bind();
        (binding as PropertyBinding & { getValue(buffer: Float32Array, offset: number): void }).getValue(value, 0);
        binding.unbind();
        // A snapshot is always constant, even if the source used GLTF cubic
        // splines with tangent triplets and a custom interpolant factory.
        const track = new Track(source.name, [0, VrmAnimationPlayer.transitionSeconds], [...value, ...value]);
        tracks.set(track.name, track);
      }
    }
    return new AnimationClip("transition-pose", VrmAnimationPlayer.transitionSeconds, [...tracks.values()]);
  }
  #clearTransition(): void {
    if (!this.#transition) return;
    this.#transition.action.stop();
    this.mixer.uncacheClip(this.#transition.clip);
    this.#transition = undefined;
  }
  destroy(): void { this.stop(); this.mixer.uncacheRoot(this.mixer.getRoot()); }
}
