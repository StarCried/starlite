import { defaultIdleBase64 } from "./default-idle-data.js";

/** Approved six-second motion; embedded in the runtime, with no asset request. */
export function defaultIdleBytes(): ArrayBuffer {
  return Uint8Array.from(atob(defaultIdleBase64), value => value.charCodeAt(0)).buffer;
}
