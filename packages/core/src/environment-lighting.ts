/** A local RGB lighting hint. Hosts own colour acquisition and permission. */
export interface EnvironmentLighting {
  color: string;
  /** 0 restores the original lighting; 1 is the default, 2 exaggerates the effect. */
  strength?: number;
  /** Overall light-energy target .8–1.1, blended/amplified by strength. Omit to infer from RGB. */
  brightness?: number;
}
export function validateEnvironmentLighting(input: unknown): asserts input is EnvironmentLighting {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("environmentLighting must be an object");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => key !== "color" && key !== "strength" && key !== "brightness") || typeof value.color !== "string" || !/^#[0-9a-f]{6}$/iu.test(value.color)) throw new Error("environmentLighting.color must be #RRGGBB");
  if (value.strength !== undefined && (typeof value.strength !== "number" || !Number.isFinite(value.strength) || value.strength < 0 || value.strength > 2)) throw new Error("environmentLighting.strength must be between 0 and 2");
  if (value.brightness !== undefined && (typeof value.brightness !== "number" || !Number.isFinite(value.brightness) || value.brightness < .8 || value.brightness > 1.1)) throw new Error("environmentLighting.brightness must be between 0.8 and 1.1");
}
