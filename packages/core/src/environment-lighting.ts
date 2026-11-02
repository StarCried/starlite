/** A local RGB lighting hint. Hosts own colour acquisition and permission. */
export interface EnvironmentLighting { color: string; strength?: number }
export function validateEnvironmentLighting(input: unknown): asserts input is EnvironmentLighting {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("environmentLighting must be an object");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => key !== "color" && key !== "strength") || typeof value.color !== "string" || !/^#[0-9a-f]{6}$/iu.test(value.color)) throw new Error("environmentLighting.color must be #RRGGBB");
  if (value.strength !== undefined && (typeof value.strength !== "number" || !Number.isFinite(value.strength) || value.strength < 0 || value.strength > 1)) throw new Error("environmentLighting.strength must be between 0 and 1");
}
