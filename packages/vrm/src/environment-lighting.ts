import { Color, DirectionalLight, HemisphereLight } from "three";
import { validateEnvironmentLighting, type EnvironmentLighting } from "@starcried/starlite-core";

const luminance = (color: Color) => .2126 * color.r + .7152 * color.g + .0722 * color.b;
const close = (a: Color, b: Color) => Math.abs(a.r-b.r) < 1e-6 && Math.abs(a.g-b.g) < 1e-6 && Math.abs(a.b-b.b) < 1e-6;
const encodeSrgb = (linear: number) => linear <= .0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - .055;

/** Reuses both existing lights; no capture, material changes or extra render work. */
export class EnvironmentLight {
  readonly light = new HemisphereLight(0xffffff, 0xb6c6d5, .65);
  readonly key = new DirectionalLight(0xffffff, 2);
  readonly #baseSky = this.light.color.clone();
  readonly #baseGround = this.light.groundColor.clone();
  readonly #sky = this.#baseSky.clone();
  readonly #ground = this.#baseGround.clone();
  #settled = true;
  #ambientIntensity = .65;
  #keyIntensity = 2;
  constructor() { this.key.position.set(-3, 4, 2); }
  set(value: EnvironmentLighting | null, immediate = false): void {
    if (value !== null) validateEnvironmentLighting(value);
    this.#sky.copy(this.#baseSky); this.#ground.copy(this.#baseGround);
    this.#ambientIntensity = .65; this.#keyIntensity = 2;
    const strength = value?.strength ?? .2;
    if (value && strength > 0) {
      // Hex is sRGB; Three converts it to linear working space before arithmetic.
      const color = new Color(value.color), maximum = Math.max(color.r, color.g, color.b);
      const response = 1 - (1 - strength) ** 3;
      const perceived = Math.min(1, Math.max(0, encodeSrgb(luminance(color))));
      const automatic = perceived <= .5 ? .8 + .4 * perceived : 1 + .2 * (perceived - .5);
      const brightness = 1 + ((value.brightness ?? automatic) - 1) * response;
      let transfer = 0;
      if (maximum > 0) {
        // Near-black compression/noise must not become a fully saturated colour.
        const confidence = Math.min(1, maximum / .02);
        const saturation = (maximum - Math.min(color.r, color.g, color.b)) / maximum;
        if (saturation > 0) {
          const hue = color.clone().multiplyScalar(1 / maximum);
          // Unit-luminance chroma avoids double darkening; cap its peak at 2.
          const mix = Math.min(.65 * response * confidence, .5 / (1 - luminance(hue)));
          const filter = new Color(0xffffff).lerp(hue, mix);
          filter.multiplyScalar(1 / luminance(filter));
          this.#sky.multiply(filter);
          this.#ground.multiply(filter).multiplyScalar(luminance(this.#baseGround) / luminance(this.#baseGround.clone().multiply(filter)));
          transfer = .8 * response * confidence * saturation;
        }
      }
      // Rebalance a bounded amount of key energy into the existing fill. Its
      // chromatic contribution is visible while the key colour stays white.
      this.#ambientIntensity = (.65 + transfer) * brightness;
      this.#keyIntensity = (2 - transfer) * brightness;
    }
    this.#settled = false;
    if (immediate) this.snap();
  }
  snap(): void {
    this.light.color.copy(this.#sky); this.light.groundColor.copy(this.#ground);
    this.light.intensity = this.#ambientIntensity; this.key.intensity = this.#keyIntensity; this.#settled = true;
  }
  update(delta: number): void {
    if (this.#settled || !Number.isFinite(delta) || delta <= 0) return;
    // ~0.5 seconds to settle. No hidden elapsed time or extra animation frame.
    const alpha = 1 - Math.exp(-Math.min(delta, .1) / .18);
    this.light.color.lerp(this.#sky, alpha); this.light.groundColor.lerp(this.#ground, alpha);
    this.light.intensity += (this.#ambientIntensity - this.light.intensity) * alpha;
    this.key.intensity += (this.#keyIntensity - this.key.intensity) * alpha;
    if (close(this.light.color, this.#sky) && close(this.light.groundColor, this.#ground)
      && Math.abs(this.light.intensity-this.#ambientIntensity) < 1e-6 && Math.abs(this.key.intensity-this.#keyIntensity) < 1e-6) this.snap();
  }
}
