import { expect, it } from "vitest";
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from "three";
import { framePortrait, visibleModelBounds } from "../src/camera.js";
import { validateVrmWidgetConfig } from "../src/config.js";

it("frames visible meshes without a hidden accessory or unrelated helper", () => {
 const scene = new Scene(), body = new Mesh(new BoxGeometry(1, 2, .4), new MeshBasicMaterial());
 body.position.y = 1; scene.add(body);
 const accessory = new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial()); accessory.visible = false; scene.add(accessory);
 const bounds = visibleModelBounds(scene); expect(bounds.max.x).toBe(.5); expect(bounds.max.y).toBe(2);
 body.position.x = 2; expect(visibleModelBounds(scene).min.x).toBe(1.5);
});
it("fits every corner at portrait angles on wide and narrow canvases", () => {
 const bounds = new Box3(new Vector3(-.45, 0, -.3), new Vector3(.45, 1.8, .35));
 for (const aspect of [.4, 2/3, 1.5]) for (const yawDegrees of [-20, 0, 20]) {
  const camera = new PerspectiveCamera(); framePortrait(camera, bounds, aspect, {fitPadding:.86}, {yawDegrees,pitchDegrees:5,fovDegrees:20,targetHeight:.53});
  for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) {
   const p = new Vector3(x,y,z).project(camera); expect(Math.abs(p.x)).toBeLessThanOrEqual(.861); expect(Math.abs(p.y)).toBeLessThanOrEqual(.861);
  }
 }
});
it("rejects invalid camera values before mounting", () => {
 for (const camera of [{yawDegrees:NaN},{pitchDegrees:90},{fovDegrees:0},{targetHeight:2}]) expect(()=>validateVrmWidgetConfig({model:'model.vrm',fallback:'fallback.png',camera})).toThrow();
});
