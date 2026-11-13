import {expect, it} from "vitest";
import {Box3, PerspectiveCamera, Vector3} from "three";
import {framePortrait} from "../src/camera.js";
import {InspectionCamera} from "../src/inspection-camera.js";

it("keeps reference geometry inside a fixed orbit and restores the latest portrait after resizing", () => {
  const bounds = new Box3(new Vector3(-.4, 0, -.3), new Vector3(.4, 1.8, .5));
  const base = new PerspectiveCamera(), view = new PerspectiveCamera(), orbit = new InspectionCamera();
  orbit.target.copy(framePortrait(base, bounds, 2/3, {fitPadding:.9}, {pitchDegrees:5}));
  const before = base.matrixWorld.clone();
  for (const dy of [0, 1200, -2400, 100]) for (let n=0;n<24;n++) {
    orbit.rotate(65, dy, base); orbit.update(.2); orbit.apply(base, view, bounds);
    expect(view.position.toArray().every(Number.isFinite)).toBe(true);
    const direction = view.position.clone().sub(orbit.target).normalize();
    expect(Math.abs(Math.asin(direction.y))).toBeLessThanOrEqual(80*Math.PI/180+1e-10);
    for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) {
      const p = new Vector3(x,y,z).project(view);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(.90001); expect(Math.abs(p.y)).toBeLessThanOrEqual(.90001);
    }
  }
  expect(base.matrixWorld.equals(before)).toBe(true);
  orbit.target.copy(framePortrait(base,bounds,.45,{}, {pitchDegrees:10}));
  orbit.apply(base,view,bounds); expect(view.matrixWorld.equals(base.matrixWorld)).toBe(false);
  orbit.reset(); orbit.update(.1); expect(orbit.engaged).toBe(true);
  orbit.update(.15); orbit.apply(base,view,bounds);
  expect(orbit.engaged).toBe(false); expect(view.matrixWorld.equals(base.matrixWorld)).toBe(true);
  expect(view.projectionMatrix.equals(base.projectionMatrix)).toBe(true);
});
