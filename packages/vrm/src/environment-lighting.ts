import { Color, HemisphereLight } from "three";
import { validateEnvironmentLighting, type EnvironmentLighting } from "@starcried/starlite-core";

/** Reuses one existing light; does not capture pixels, add lights or render frames. */
export class EnvironmentLight {
  readonly light = new HemisphereLight(0xffffff, 0xb6c6d5, .65);
  readonly #baseSky = this.light.color.clone();
  readonly #baseGround = this.light.groundColor.clone();
  readonly #sky = this.#baseSky.clone();
  readonly #ground = this.#baseGround.clone();
  set(value: EnvironmentLighting | null, immediate = false): void {
    if (value !== null) validateEnvironmentLighting(value);
    this.#sky.copy(this.#baseSky); this.#ground.copy(this.#baseGround);
    if (value) {
      // Three interprets hex as sRGB and converts it to the renderer's linear space.
      // White mixing bounds saturation and retains at least 45% ambient brightness,
      // even at full strength against black. The neutral key light never changes.
      const tint = new Color(value.color).lerp(new Color(0xffffff), .45);
      const filter = new Color(0xffffff).lerp(tint, value.strength ?? .2);
      this.#sky.multiply(filter); this.#ground.multiply(filter);
    }
    if (immediate) this.snap();
  }
  snap(): void { this.light.color.copy(this.#sky); this.light.groundColor.copy(this.#ground); }
  update(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    // ~0.5 seconds to settle; pause/resume supplies bounded active time only.
    const alpha = 1 - Math.exp(-Math.min(delta, .1) / .18);
    this.light.color.lerp(this.#sky, alpha); this.light.groundColor.lerp(this.#ground, alpha);
  }
}
