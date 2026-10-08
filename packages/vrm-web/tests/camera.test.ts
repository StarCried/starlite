import { expect, it } from "vitest";
import { Bone, Box3, BoxGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";
import { framePortrait, visibleModelBounds, MotionFraming } from "../src/camera.js";
import { PoseBounds } from "../src/pose-bounds.js";
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

it("keeps a raised or inverted pose inside the fixed portrait target, then returns smoothly", () => {
 const camera = new PerspectiveCamera(), base = new Box3(new Vector3(-.4,0,-.2),new Vector3(.4,1.8,.2));
 const render = {fitPadding:.9}, options = {targetHeight:.53,pitchDegrees:5};
 const target = framePortrait(camera,base,2/3,render,options), original = camera.position.clone(), framing = new MotionFraming();
 framing.reset(camera,target);
 for(const pose of [new Box3(new Vector3(-1.4,0,-.4),new Vector3(1.4,2.5,.4)),new Box3(new Vector3(-.6,-.5,-.4),new Vector3(.6,2.9,.4))]) {
  framing.update(camera,pose,1/30,render,options);
  for(const x of [pose.min.x,pose.max.x])for(const y of [pose.min.y,pose.max.y])for(const z of [pose.min.z,pose.max.z]) {
   const p=new Vector3(x,y,z).project(camera);expect(Math.abs(p.x)).toBeLessThanOrEqual(.901);expect(Math.abs(p.y)).toBeLessThanOrEqual(.901);
  }
 }
 const widened=camera.position.clone();framing.update(camera,undefined,1/30,render,options);
 expect(camera.position.distanceTo(target)).toBeLessThan(widened.distanceTo(target));
 expect(camera.position.distanceTo(original)).toBeGreaterThan(.1);
 for(let i=0;i<120;i++)framing.update(camera,undefined,1/30,render,options);
 expect(camera.position.distanceTo(original)).toBeLessThan(.001);
});

it("bounds posed weighted skin and blended morphs without resampling vertices", () => {
 const root=new Scene(), geometry=new BoxGeometry(.3,.6,.2), count=geometry.getAttribute('position').count;
 const indices=[],weights=[];for(let i=0;i<count;i++){indices.push(0,1,0,0);weights.push(.3,.7,0,0)}
 geometry.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));
 geometry.morphTargetsRelative=true;geometry.morphAttributes.position=[new Float32BufferAttribute(Array.from({length:count*3},(_,i)=>i%3===0?.05:0),3),new Float32BufferAttribute(Array.from({length:count*3},(_,i)=>i%3===0?10:0),3)];
 const mesh=new SkinnedMesh(geometry,new MeshBasicMaterial()),a=new Bone(),b=new Bone();mesh.add(a,b);root.add(mesh);mesh.bind(new Skeleton([a,b]));
 const bounds=new PoseBounds(root);a.position.set(-.8,1,0);b.rotation.z=Math.PI/2;b.position.set(.8,2,0);mesh.morphTargetInfluences![0]=1;
 const actual=visibleModelBounds(root), conservative=bounds.measure(root);
 expect(conservative.containsBox(actual)).toBe(true);
 expect(conservative.max.x).toBeLessThan(2); // Inactive extreme morph must not zoom out.
 mesh.morphTargetInfluences![0]=-.5;expect(bounds.measure(root).containsBox(visibleModelBounds(root))).toBe(true);
 mesh.morphTargetInfluences![1]=.5;expect(bounds.measure(root).containsBox(visibleModelBounds(root))).toBe(true);
 mesh.morphTargetInfluences![1]=0;
 a.position.x=1.8;expect(bounds.measure(root).max.x).toBeGreaterThan(1.8);
});
