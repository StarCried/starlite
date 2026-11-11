import type { AnimationPlaybackResult } from "./index.js";

/** User gestures may replace automatic gestures, but never host-owned playback. */
export class InteractionGate {
  #external: Promise<AnimationPlaybackResult> | undefined;
  #lastClickAt = -Infinity;

  get externalActive(): boolean { return this.#external !== undefined; }

  protect(playback: Promise<AnimationPlaybackResult>): Promise<AnimationPlaybackResult> {
    this.#external = playback;
    const finish = () => { if (this.#external === playback) this.#external = undefined; };
    void playback.then(finish, finish);
    return playback;
  }

  acceptClick(timestampMs: number): boolean {
    if (this.externalActive || timestampMs - this.#lastClickAt < 500) return false;
    this.#lastClickAt = timestampMs;
    return true;
  }
}
