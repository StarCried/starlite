import { defaultIdleBytes } from "./default-idle.js";
import { builtinMotionDeflate } from "./builtin-motion-data.js";
import type { BuiltinAnimationName } from "./builtin-motion-catalog.js";
/** Lossless storage keeps built-in gestures small without a network dependency. */
export async function builtinMotionBytes(name: BuiltinAnimationName): Promise<ArrayBuffer> {
  if (name === "StarLiteIdle") return defaultIdleBytes();
  const packed = Uint8Array.from(atob(builtinMotionDeflate[name]), value => value.charCodeAt(0));
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Response(stream).arrayBuffer();
}
