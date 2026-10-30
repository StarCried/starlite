/** Program motions are independent of model artwork and need no network request. */
export const BUILTIN_ANIMATIONS = [
  { name: "StarLiteIdle", durationMs: 6000 },
  { name: "StarLiteCuriousPeek", durationMs: 2100 },
  { name: "StarLiteHappyWave", durationMs: 4500 },
  { name: "StarLiteSleepyStartle", durationMs: 5500 },
] as const;
export type BuiltinAnimationName = (typeof BUILTIN_ANIMATIONS)[number]["name"];
export function isBuiltinAnimation(name: string): name is BuiltinAnimationName {
  return BUILTIN_ANIMATIONS.some(animation => animation.name === name);
}
