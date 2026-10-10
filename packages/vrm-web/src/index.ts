import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMPose } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip, type VRMAnimation } from "@pixiv/three-vrm-animation";
import { RenderedHitMask, type ModelHitMaskListener, DialogueBubble, DialogueScheduler, fetchBounded, type DialogueAction, type MountOptions, type WidgetStatus, type AnimationPlaybackOptions, type AnimationPlaybackResult } from "model-widget-core";
import { validateCharacterProfile, validateVrmWidgetConfig } from "./config.js";
import { parseGlb, inspectVrma, MAX_ANIMATION_BYTES } from "./inspect.js";
import { VrmAnimationPlayer } from "./playback.js";
import { visibleModelBounds, framePortrait, ExpandedViewport } from "./camera.js";
import { PoseBounds } from "./pose-bounds.js";
import { HostMotion } from "./host-motion.js";
import { PointerGaze } from "./gaze.js";
import { CharacterBehavior } from "./character.js";
import type { CharacterProfile, VrmController, VrmDiagnostics, VrmWidgetConfig } from "./types.js";
export type * from "./types.js";
export { validateVrmWidgetConfig } from "./config.js";

export async function mountModelWidget(host: HTMLElement, config: VrmWidgetConfig, options: MountOptions = {}): Promise<VrmController> {
  validateVrmWidgetConfig(config); options.signal?.throwIfAborted();
  const controller = new Controller(host, config);
  if (!config.mobile?.show && matchMedia(`(max-width: ${(config.mobile?.breakpoint ?? 768) - 1}px)`).matches) {
    controller.disable(); return controller;
  }
  await controller.mount(options.signal);
  return controller;
}
export const mountVrmWidget = mountModelWidget;

class Controller implements VrmController {
  readonly #host: HTMLElement;
  readonly #config: VrmWidgetConfig;
  readonly #abort = new AbortController();
  readonly #clips = new Map<string, THREE.AnimationClip>();
  readonly #listeners: (() => void)[] = [];
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(30, 1, .01, 100);
  readonly #baseCamera = new THREE.PerspectiveCamera(30, 1, .01, 100);
  readonly #gaze: PointerGaze;
  readonly #canvas = document.createElement("canvas");
  readonly #hitMask = new RenderedHitMask();
  readonly #fallback = document.createElement("img");
  readonly #bubble: DialogueBubble;
  readonly #dialogue: DialogueScheduler;
  readonly #stats: VrmDiagnostics = { renderedFrames: 0, frameTimesMs: [], renderCostsMs: [], calls: 0, triangles: 0, geometries: 0, textures: 0, renderer: "", loadMs: 0 };
  #status: WidgetStatus = "loading";
  #renderer: THREE.WebGLRenderer | undefined;
  #vrm: VRM | undefined;
  #player: VrmAnimationPlayer | undefined;
  #character: CharacterBehavior | undefined;
  #profile: CharacterProfile | undefined;
  #neutral: VRMPose | undefined;
  #portraitBounds: THREE.Box3 | undefined;
  #poseBounds: PoseBounds | undefined;
  #hostMotion: HostMotion | undefined;
  readonly #motionBounds = new THREE.Box3();
  readonly #projected = new THREE.Vector3();
  readonly #viewport: ExpandedViewport;
  #pixelRatio = 0;
  #resizeObserver: ResizeObserver | undefined;
  #frame: number | undefined;
  #lastTime: number | undefined;
  #lastFrameTime: number | undefined;
  #playStartedAt: number | undefined;
  #paused = false;
  #elapsed = 0;
  #ambientSuppressed = false;
  #reduced = matchMedia("(prefers-reduced-motion: reduce)");

  constructor(host: HTMLElement, config: VrmWidgetConfig) {
    this.#host = host; this.#config = config; this.#gaze = new PointerGaze(config.gaze);
    this.#viewport = new ExpandedViewport(config.render?.viewportPadding);
    this.#bubble = new DialogueBubble(host);
    const d = config.dialogue;
    this.#dialogue = new DialogueScheduler({
      enter: d?.enter ? { ...d.enter, durationMs: d.enter.durationMs ?? 4000, delayMs: d.enter.delayMs ?? 1000 } : false,
      idle: d?.idle ? { ...d.idle, durationMs: d.idle.durationMs ?? 4000, intervalMinMs: d.idle.intervalMinMs ?? 30000, intervalMaxMs: d.idle.intervalMaxMs ?? 60000 } : false,
      click: d?.click ? { ...d.click, durationMs: d.click.durationMs ?? 4000 } : false,
    }, Math.random);
  }
  get status(): WidgetStatus { return this.#status; }
  disable(): void { this.#setStatus("disabled"); }
  async mount(signal?: AbortSignal): Promise<void> {
    const started = performance.now();
    const timeout = setTimeout(() => this.#abort.abort(new Error("model loading timed out")), this.#config.network?.requestTimeoutMs ?? 30000);
    if (signal) {
      const cancel = () => this.destroy();
      signal.addEventListener("abort", cancel, { once: true });
      this.#listeners.push(() => signal.removeEventListener("abort", cancel));
    }
    this.#host.classList.add("model-vrm-widget");
    this.#host.style.width = `${this.#config.display?.width ?? 320}px`;
    this.#host.style.height = `${this.#config.display?.height ?? 480}px`;
    this.#fallback.src = this.#config.fallback; this.#fallback.alt = ""; this.#fallback.hidden = true; this.#bubble.hide();
    this.#host.replaceChildren(this.#canvas, this.#fallback, this.#bubble.element);
    this.#setStatus("loading");
    try {
      const bytes = await fetchBounded(this.#config.model, this.#config.network?.modelMaxBytes ?? 64 * 1024 * 1024, this.#abort.signal);
      parseGlb(bytes, "vrm");
      const manager = new THREE.LoadingManager();
      let imageLoadFailed = false;
      // GLTFLoader tolerates texture failures and otherwise returns white materials.
      // A blocked/invalid embedded image must use the existing fallback, not report ready.
      manager.onError = () => { imageLoadFailed = true; };
      manager.setURLModifier((url) => { if (!url.startsWith("blob:") && !url.startsWith("data:")) throw new Error("external model resource rejected"); return url; });
      const loader = new GLTFLoader(manager);
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.parseAsync(bytes, "");
      if (this.#abort.signal.aborted) { VRMUtils.deepDispose(gltf.scene); this.#abort.signal.throwIfAborted(); }
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) throw new Error("model did not produce a VRM instance");
      this.#vrm = vrm;
      if (imageLoadFailed) throw new Error("VRM texture loading failed; check image decoding and CSP connect-src/img-src blob: permissions");
      VRMUtils.rotateVRM0(vrm);
      VRMUtils.combineSkeletons(vrm.scene);
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      // Custom expression-blink morphs must survive loading unchanged.
      this.#scene.add(vrm.scene);
      if (this.#config.profile) {
        const profile = typeof this.#config.profile === "string"
          ? JSON.parse(new TextDecoder().decode(await fetchBounded(this.#config.profile, 1024 * 1024, this.#abort.signal)))
          : this.#config.profile;
        validateCharacterProfile(profile); this.#profile = profile;
        vrm.humanoid.setNormalizedPose(profile.neutralPose as VRMPose);
      }
      this.#neutral = vrm.humanoid.getNormalizedPose();
      this.#character = new CharacterBehavior(vrm, this.#profile);
      const animationLoader = new GLTFLoader(manager);
      animationLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      let animationBytes = 0;
      for (const source of this.#config.animations ?? []) {
        const buffer = await fetchBounded(source.url, MAX_ANIMATION_BYTES, this.#abort.signal);
        animationBytes += buffer.byteLength;
        if (animationBytes > 64 * 1024 * 1024) throw new Error("animation collection exceeds 64 MiB");
        inspectVrma(buffer);
        const asset = await animationLoader.parseAsync(buffer, "");
        this.#abort.signal.throwIfAborted();
        const animation = (asset.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
        if (!animation) throw new Error(`invalid VRMA: ${source.name}`);
        const clip = createVRMAnimationClip(animation, vrm);
        if (!clip.tracks.length || clip.tracks.some((track) => Array.from(track.values).some((value) => !Number.isFinite(value)))) throw new Error(`animation has invalid or incompatible tracks: ${source.name}`);
        clip.name = source.name; this.#clips.set(source.name, clip);
      }
      if (this.#profile?.neutralAnimation) {
        const clip = this.#clips.get(this.#profile.neutralAnimation);
        if (!clip) throw new Error("profile neutral animation is missing");
        const sampler = new THREE.AnimationMixer(vrm.scene);
        sampler.clipAction(clip).play(); sampler.update(0);
        this.#neutral = vrm.humanoid.getNormalizedPose();
        sampler.stopAllAction(); sampler.uncacheRoot(vrm.scene);
        vrm.humanoid.setNormalizedPose(this.#neutral);
      }
      this.#player = new VrmAnimationPlayer(vrm.scene, this.#clips, () => this.#restoreNeutral(), this.#config.ambient?.animations?.[0]);
      this.#renderer = new THREE.WebGLRenderer({ canvas: this.#canvas, alpha: true, antialias: true, premultipliedAlpha: true });
      this.#renderer.setClearColor(0x000000, 0);
      this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
      const gl = this.#renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      this.#stats.renderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      this.#scene.add(new THREE.HemisphereLight(0xffffff, 0xb6c6d5, .65));
      const light = new THREE.DirectionalLight(0xffffff, 2.0);
      // A side key exposes MToon shade bands instead of washing out both sides.
      light.position.set(-3, 4, 2); this.#scene.add(light);
      vrm.humanoid.update(); this.#portraitBounds = visibleModelBounds(vrm.scene);
      this.#poseBounds = new PoseBounds(vrm.scene);
      this.#hostMotion = new HostMotion(vrm.scene, vrm.springBoneManager);
      this.#resize(); this.#bind(); this.#startAmbient();
      this.#dialogue.start(0, this.#reduced.matches);
      this.#tick(0); this.#stats.loadMs = performance.now() - started; this.#sync();
    } catch (error) {
      if (this.#status === "destroyed") return;
      this.#dispose(); this.#canvas.hidden = true; this.#fallback.hidden = false;
      this.#setStatus("fallback");
      this.#host.dispatchEvent(new CustomEvent("model-error", { detail: error instanceof Error ? error.message : "VRM load failed" }));
    } finally { clearTimeout(timeout); }
  }
  getAnimations(): readonly { name: string; durationMs: number }[] { return [...this.#clips].map(([name, clip]) => ({ name, durationMs: clip.duration * 1000 })); }
  playAnimation(name: string, options: AnimationPlaybackOptions = {}): Promise<AnimationPlaybackResult> {
    if (!this.#player || this.#status === "destroyed" || this.#status === "fallback" || this.#reduced.matches) return Promise.resolve("stopped");
    if (!this.#clips.has(name)) return Promise.reject(new Error(`animation does not exist: ${name}`));
    if (this.#player.activeName !== name || options.restart) this.#playStartedAt = performance.now();
    this.#gaze.restoreHead(); this.#ambientSuppressed = false; this.#character?.reset();
    return this.#player.play(name, options);
  }
  getExpressions(): readonly string[] { return this.#vrm?.expressionManager?.expressions.map(e => e.expressionName) ?? []; }
  setExpression(name: string, weight: number): void {
    if (!Number.isFinite(weight) || weight < 0 || weight > 1 || !this.#vrm?.expressionManager?.getExpression(name)) throw new Error("invalid expression");
    this.stopAnimation(); this.#vrm.expressionManager.setValue(name, weight);
    if (this.#status === "paused") this.#tick(0);
  }
  stopAnimation(): void { this.#playStartedAt = undefined; this.#gaze.restoreHead(); this.#ambientSuppressed = true; this.#player?.stop(); }
  pause(): void { this.#paused = true; this.#bubble.hide(); this.#sync(); }
  resume(): void { this.#paused = false; this.#dialogue.deferIdle(this.#elapsed * 1000); this.#sync(); }
  resetCamera(): void { this.#resize(); if (this.#status === "paused") this.#tick(0); }
  observeInteractionMask(listener?: ModelHitMaskListener): void {
    this.#hitMask.setListener(this.#status === "destroyed" ? undefined : listener);
    if (listener && this.#renderer && this.#vrm) {
      this.#renderer.render(this.#scene, this.#camera);
      this.#hitMask.capture(this.#canvas, performance.now());
    }
  }
  setPointerPosition(clientX: number, clientY: number): void {
    if (!(this.#config.interactions?.pointer ?? true) || this.#status !== "running") return;
    this.#gaze.move(clientX, clientY, this.#host.getBoundingClientRect(), { width: innerWidth, height: innerHeight });
  }
  setHostPosition(x: number, y: number): void {
    if (this.#status === "running") this.#hostMotion?.setPosition(x, y);
  }
  captureFrame(): string {
    if (!this.#renderer || !this.#vrm) throw new Error("model is not ready");
    this.#renderer.render(this.#scene, this.#camera);
    return this.#canvas.toDataURL("image/png");
  }
  diagnostics(): VrmDiagnostics { return { ...this.#stats, springPose: [...(this.#vrm?.springBoneManager?.joints ?? [])].map(joint => ({ name: joint.bone.name, rotation: joint.bone.quaternion.toArray() })), activeAnimation: this.#player?.activeName ?? null, gaze: { headYawDegrees: this.#gaze.headAngles.yawDegrees, headPitchDegrees: this.#gaze.headAngles.pitchDegrees, yawDegrees: this.#vrm?.lookAt?.yaw ?? 0, pitchDegrees: this.#vrm?.lookAt?.pitch ?? 0 }, frameTimesMs: [...this.#stats.frameTimesMs], renderCostsMs: [...this.#stats.renderCostsMs] }; }
  destroy(): void {
    if (this.#status === "destroyed") return;
    this.#abort.abort(); this.#dispose(); this.#hitMask.destroy();
    for (const remove of this.#listeners.splice(0)) remove();
    this.#resizeObserver?.disconnect(); this.#resizeObserver = undefined;
    const { baseWidth, baseHeight } = this.#viewport.rect;
    if (baseWidth && baseHeight) this.#host.dispatchEvent(new CustomEvent("model-viewport-change", { bubbles: true,
      detail: { left: 0, top: 0, width: baseWidth, height: baseHeight, baseWidth, baseHeight } }));
    this.#canvas.remove(); this.#fallback.remove(); this.#bubble.destroy(); this.#host.classList.remove("model-vrm-widget");
    this.#setStatus("destroyed");
  }
  #restoreNeutral(): void {
    this.#gaze.restoreHead();
    if (this.#neutral) this.#vrm?.humanoid.setNormalizedPose(this.#neutral);
    this.#vrm?.expressionManager?.resetValues(); this.#character?.reset();
  }
  #startAmbient(): void {
    const name = this.#config.ambient?.animations?.[0];
    if (name && !this.#player?.activeName && !this.#ambientSuppressed && !this.#reduced.matches) void this.#player?.play(name, { mode: "loop" });
  }
  #foregroundActive(): boolean {
    return Boolean(this.#player?.isOneShot || (this.#player?.activeName && this.#player.activeName !== this.#config.ambient?.animations?.[0]));
  }
  #sync(): void {
    if (this.#status === "destroyed" || this.#status === "fallback" || this.#status === "disabled" || !this.#renderer) return;
    if (this.#paused || document.visibilityState !== "visible") { this.#bubble.hide(); this.#gaze.reset(); this.#hostMotion?.suspend(); }
    const paused = this.#paused || document.visibilityState !== "visible" || this.#reduced.matches;
    this.#stopFrame(); this.#setStatus(paused ? "paused" : "running");
    if (!paused) this.#schedule();
  }
  #schedule(): void {
    if (this.#frame !== undefined || this.#status !== "running") return;
    this.#frame = requestAnimationFrame((timestamp) => {
      this.#frame = undefined;
      const interval = 1000 / (this.#config.render?.fps ?? 30);
      const elapsed = this.#lastTime === undefined ? interval : timestamp - this.#lastTime;
      if (elapsed >= interval - .1) {
        const delta = this.#lastFrameTime === undefined ? 0 : Math.min(.1, (timestamp - this.#lastFrameTime) / 1000);
        this.#lastTime = (this.#lastTime ?? timestamp - interval) + Math.max(1, Math.floor((elapsed + .1) / interval)) * interval;
        if (this.#lastFrameTime !== undefined) this.#record(this.#stats.frameTimesMs, timestamp - this.#lastFrameTime);
        this.#lastFrameTime = timestamp;
        try { this.#tick(delta); }
        catch { this.#dispose(); this.#fallback.hidden = false; this.#canvas.hidden = true; this.#setStatus("fallback"); }
      }
      this.#schedule();
    });
  }
  #tick(delta: number): void {
    const vrm = this.#vrm, renderer = this.#renderer;
    if (!vrm || !renderer) return;
    const started = performance.now(); this.#elapsed += delta;
    this.#gaze.restoreHead();
    // The preceding frame can predate the trigger, especially after shader
    // compilation. Only the time since this clip started belongs to its first sample.
    const animationDelta = this.#playStartedAt === undefined ? delta : Math.min(delta, Math.max(0, (performance.now() - this.#playStartedAt) / 1000));
    this.#playStartedAt = undefined;
    this.#player?.update(animationDelta); this.#startAmbient();
    const action = this.#dialogue.poll(this.#elapsed * 1000, this.#foregroundActive());
    if (action) this.#showDialogue(action);
    this.#bubble.update(this.#elapsed * 1000);
    // Only the base Idle pose follows the pointer. Foreground gestures retain
    // their authored head/eye direction, including constant look-at tracks.
    const authoredGaze = this.#config.interactions?.pointer === false || this.#foregroundActive();
    this.#gaze.updateHead(vrm.humanoid.getNormalizedBoneNode("head"), this.#baseCamera, delta, authoredGaze);
    vrm.humanoid.update();
    if (vrm.lookAt) {
      if (authoredGaze && !this.#player?.hasLookAtTrack) {
        vrm.lookAt.yaw = 0; vrm.lookAt.pitch = 0;
      }
      this.#gaze.update(vrm.lookAt, this.#baseCamera, delta, authoredGaze);
      vrm.lookAt.update(delta);
    }
    this.#character?.beforeExpressions(delta, this.#player?.hasBlinkTrack); vrm.expressionManager?.update();
    this.#character?.afterExpressions();
    vrm.nodeConstraintManager?.update();
    this.#hostMotion?.update(delta, this.#baseCamera, this.#viewport.rect.baseHeight);
    for (const material of vrm.materials ?? []) (material as THREE.Material & { update?: (delta: number) => void }).update?.(delta);
    const bounds = this.#poseBounds?.measure(vrm.scene, this.#motionBounds) ?? this.#portraitBounds;
    if (bounds && this.#config.render?.autoFit !== false && this.#viewport.expand(this.#baseCamera, bounds)) this.#applyViewport();
    let maxAbsX = 0, maxAbsY = 0;
    if (bounds) for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const p = this.#projected.set(x, y, z).project(this.#camera);
      maxAbsX = Math.max(maxAbsX, Math.abs(p.x)); maxAbsY = Math.max(maxAbsY, Math.abs(p.y));
    }
    this.#stats.framing = { distance: this.#camera.position.length(), maxAbsX, maxAbsY, viewport: this.#viewport.rect };
    renderer.render(this.#scene, this.#camera);
    this.#hitMask.capture(this.#canvas, performance.now());
    this.#stats.renderedFrames++;
    this.#stats.calls = renderer.info.render.calls; this.#stats.triangles = renderer.info.render.triangles;
    this.#stats.geometries = renderer.info.memory.geometries; this.#stats.textures = renderer.info.memory.textures;
    this.#record(this.#stats.renderCostsMs, performance.now() - started);
  }
  #record(values: number[], value: number): void { if (values.length === 1800) values.shift(); values.push(value); }
  #stopFrame(): void { if (this.#frame !== undefined) cancelAnimationFrame(this.#frame); this.#frame = undefined; this.#lastTime = undefined; this.#lastFrameTime = undefined; }
  #resize(): void {
    this.#bubble.position();
    if (!this.#renderer || !this.#vrm) return;
    const rect = this.#host.getBoundingClientRect(), width = rect.width || 320, height = rect.height || 480;
    const pixelRatio = Math.min(devicePixelRatio || 1, this.#config.render?.maxDevicePixelRatio ?? 1.5);
    const changed = this.#viewport.resize(width, height);
    if (!changed && pixelRatio === this.#pixelRatio) return;
    this.#pixelRatio = pixelRatio; this.#renderer.setPixelRatio(pixelRatio);
    if (changed && this.#portraitBounds) framePortrait(this.#baseCamera, this.#portraitBounds, width / height, this.#config.render, this.#config.camera);
    this.#camera.copy(this.#baseCamera);
    this.#applyViewport();
  }
  #applyViewport(): void {
    if (!this.#renderer) return;
    const viewport = this.#viewport.rect;
    this.#viewport.apply(this.#camera);
    this.#renderer.setSize(viewport.width, viewport.height, false);
    Object.assign(this.#canvas.style, { left: `${viewport.left}px`, top: `${viewport.top}px`, width: `${viewport.width}px`, height: `${viewport.height}px` });
    this.#host.dispatchEvent(new CustomEvent("model-viewport-change", { bubbles: true, detail: viewport }));
  }
  #bind(): void {
    const on = (target: EventTarget, event: string, handler: EventListener, capture = false) => { target.addEventListener(event, handler, capture); this.#listeners.push(() => target.removeEventListener(event, handler, capture)); };
    on(document, "visibilitychange", () => this.#sync()); on(this.#reduced, "change", () => { this.#sync(); if (this.#reduced.matches) this.#tick(0); });
    on(this.#canvas, "webglcontextlost", (event) => { event.preventDefault(); if (this.#status === "destroyed" || this.#status === "fallback") return; this.#setStatus("fallback"); this.#dispose(); this.#canvas.hidden = true; this.#fallback.hidden = false; this.#setStatus("fallback"); });
    on(window, "pointermove", (event) => {
      if (!(this.#config.interactions?.pointer ?? true) || this.#status !== "running") return;
      const pointer = event as PointerEvent;
      if (pointer.pointerType !== "touch") this.setPointerPosition(pointer.clientX, pointer.clientY);
    }, true);
    on(document, "pointerout", (event) => { if (!(event as PointerEvent).relatedTarget) this.#gaze.reset(); });
    on(window, "blur", () => this.#gaze.reset());
    let down: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | undefined;
    on(this.#canvas, "pointerdown", (event) => { const p = event as PointerEvent; if (p.button !== 0) return; const r = this.#host.getBoundingClientRect(); down = { id: p.pointerId, x: p.clientX, y: p.clientY, left: r.left, top: r.top, moved: false }; if (this.#config.interactions?.drag) this.setHostPosition(r.left, r.top); });
    on(window, "pointermove", (event) => {
      const p = event as PointerEvent; if (!down || down.id !== p.pointerId) return;
      const dx = p.clientX - down.x, dy = p.clientY - down.y; down.moved ||= Math.hypot(dx, dy) > 5;
      if (!this.#config.interactions?.drag || !down.moved) return;
      const left = Math.max(0, Math.min(innerWidth - this.#host.offsetWidth, down.left + dx)), top = Math.max(0, Math.min(innerHeight - this.#host.offsetHeight, down.top + dy));
      Object.assign(this.#host.style, { position: "fixed", right: "auto", bottom: "auto", left: `${left}px`, top: `${top}px` });
      this.setHostPosition(left, top);
      this.#bubble.position();
    });
    on(window, "pointerup", (event) => {
      if (!down || down.id !== (event as PointerEvent).pointerId) return;
      const clicked = down && !down.moved; down = undefined;
      if (!clicked || this.#foregroundActive()) return;
      const action = this.#dialogue.triggerClick(this.#elapsed * 1000);
      if (action) this.#showDialogue(action);
      else if (this.#config.interactions?.click) {
        const click = this.#config.interactions.click;
        const names = click.animations ?? [click.animation!];
        void this.playAnimation(names[Math.floor(Math.random() * names.length)]!, { mode: "once", restart: true });
      }
    });
    on(window, "pointercancel", () => { down = undefined; });
    this.#resizeObserver = new ResizeObserver(() => this.resetCamera()); this.#resizeObserver.observe(this.#host);
  }
  #showDialogue(action: DialogueAction): void { this.#bubble.show(action, this.#elapsed * 1000, this.#reduced.matches); void this.playAnimation(action.animation, { mode: "once", restart: true }); }
  #setStatus(status: WidgetStatus): void { this.#status = status; this.#host.dataset.modelStatus = status; }
  #dispose(): void {
    this.#hitMask.clear();
    this.#bubble.hide(); this.#stopFrame(); this.#player?.destroy(); this.#player = undefined; this.#hostMotion?.destroy(); this.#hostMotion = undefined;
    if (this.#vrm) {
      const closed = new Set<object>();
      this.#vrm.scene.traverse((object) => {
        const materials = (object as THREE.Mesh).material;
        for (const material of materials ? (Array.isArray(materials) ? materials : [materials]) : []) {
          for (const value of Object.values(material)) {
            const data = ((value as THREE.Texture | undefined)?.isTexture ? (value as THREE.Texture).source.data : undefined) as { close?: () => void } | undefined;
            if (data && typeof data.close === "function" && !closed.has(data)) { data.close(); closed.add(data); }
          }
        }
      });
      VRMUtils.deepDispose(this.#vrm.scene); this.#scene.remove(this.#vrm.scene);
    }
    this.#clips.clear(); this.#character = undefined; this.#vrm = undefined; this.#profile = undefined; this.#portraitBounds = undefined; this.#poseBounds = undefined;
    this.#renderer?.dispose(); this.#renderer?.forceContextLoss(); this.#renderer = undefined;
  }
}
