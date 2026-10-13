import { Box3, Matrix3, Matrix4, Mesh, SkinnedMesh, Vector3, type Object3D } from "three";

interface JointBounds { base: Box3; morphs: Map<number, Box3> }

/** Conservative skin bounds: build vertex clusters once, then transform one box
 * per influencing bone. This avoids reskinning every vertex on every frame. */
export class PoseBounds {
  readonly #meshes: { mesh: Mesh; boxes: Map<number, JointBounds> }[] = [];
  readonly #matrix = new Matrix4();
  readonly #box = new Box3();
  constructor(root: Object3D) {
    const point = new Vector3(), local = new Vector3(), offset = new Vector3(), matrix = new Matrix4(), linear = new Matrix3();
    root.traverseVisible(object => {
      if (!(object instanceof Mesh)) return;
      const mesh = object, geometry = mesh.geometry, positions = geometry.getAttribute("position");
      if (!positions) return;
      const boxes = new Map<number, JointBounds>();
      const skin = mesh instanceof SkinnedMesh;
      const indices = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
      for (let vertex = 0; vertex < positions.count; vertex++) {
        point.fromBufferAttribute(positions, vertex);
        if (skin && (!indices || !weights)) throw new Error("skin bounds require joint indices and weights");
        for (let axis = 0; axis < (skin ? 4 : 1); axis++) {
          if (skin && weights!.getComponent(vertex, axis) <= 0) continue;
          const joint = skin ? indices!.getComponent(vertex, axis) : -1;
          matrix.identity();
          if (skin) {
            const inverse = mesh.skeleton.boneInverses[joint];
            if (!inverse) throw new Error("skin bounds reference a missing joint");
            matrix.copy(inverse).multiply(mesh.bindMatrix);
          }
          linear.setFromMatrix4(matrix);
          const box = boxes.get(joint) ?? { base: new Box3(), morphs: new Map<number, Box3>() };
          box.base.expandByPoint(local.copy(point).applyMatrix4(matrix));
          for (const [index, morph] of (geometry.morphAttributes.position ?? []).entries()) {
            offset.fromBufferAttribute(morph, vertex);
            if (!geometry.morphTargetsRelative) offset.sub(point);
            if (offset.lengthSq() === 0) continue;
            offset.applyMatrix3(linear);
            // Include zero: other vertices in this cluster may not use a morph.
            const delta = box.morphs.get(index) ?? new Box3(new Vector3(), new Vector3());
            delta.expandByPoint(offset); box.morphs.set(index, delta);
          }
          boxes.set(joint, box);
        }
      }
      this.#meshes.push({ mesh, boxes });
    });
  }
  measure(root: Object3D, result = new Box3()): Box3 {
    root.updateMatrixWorld(true); result.makeEmpty();
    for (const { mesh, boxes } of this.#meshes) {
      if (!mesh.visible) continue;
      for (const [joint, box] of boxes) {
        this.#matrix.copy(mesh.matrixWorld);
        if (mesh instanceof SkinnedMesh) this.#matrix.multiply(mesh.bindMatrixInverse).multiply(mesh.skeleton.bones[joint]!.matrixWorld);
        this.#box.copy(box.base);
        // Only active morphs contribute, rather than sizing the camera for all
        // mutually exclusive facial expressions simultaneously.
        for (const [index, delta] of box.morphs) {
          const weight = mesh.morphTargetInfluences?.[index] ?? 0;
          if (!Number.isFinite(weight)) throw new Error("non-finite morph weight");
          this.#box.min.addScaledVector(weight < 0 ? delta.max : delta.min, weight);
          this.#box.max.addScaledVector(weight < 0 ? delta.min : delta.max, weight);
        }
        result.union(this.#box.applyMatrix4(this.#matrix));
      }
    }
    return result;
  }
}
