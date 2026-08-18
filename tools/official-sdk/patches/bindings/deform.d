/**
    Runtime deformation parameter bindings for the browser build.

    Copyright:
        Copyright © 2020-2026, Inochi2D Project
        Copyright © 2026, StarCried contributors

    License:
        BSD 2-clause License
*/
module inochi2d.param.bindings.deform;
import inochi2d.param.parameters;
import inochi2d.param.bindings;
import inochi2d.param.bindings.node;
import inochi2d.param.utils;
import inochi2d.core.vector2d;
import inochi2d.core.registry;
import inochi2d.core.serde;
import inochi2d.core.math;
import inochi2d.common;
import inochi2d.nodes;
import numem;

/**
    A parameter binding to mesh deformation offsets.
*/
@TypeId("deform", IN_MAKE_TAG!(1, 0))
class ParameterDeformBinding : ParameterNodeBinding {
private:
@nogc:
    vector2d!Deformation values_;
    Deformation interpolated_;
    uint invalidApplications_;

protected:
    override
    void onSerialize(ref DataNode object) {
        super.onSerialize(object);
        object["values"] = values_.data.serialize();
    }

    override
    void onDeserialize(ref DataNode object, ref ModelState state) {
        super.onDeserialize(object, state);
        if ("values" in object) {
            object["values"].deserialize08NestedArrays(
                values_,
                state,
                bindingDimensions(parameter)
            );
        }
    }

public:
    @property slice2d!Deformation values() => values_[];
    @property uint invalidApplications() const => invalidApplications_;

    this(Parameter param) {
        super(param);
        const dims = bindingDimensions(param);
        values_.resize(dims.x, dims.y);
    }

    this(Parameter param, Node node) {
        this(param);
        this.target = node;
    }

    override
    void apply(vec2u index, vec2 norm) {
        // Creator 0.8 prunes bindings whose optional template node is absent
        // from the exported puppet. Current SDK deserialization retains the
        // binding with a null target, so mirror the legacy no-op behavior.
        if (!target) {
            return;
        }
        auto deformable = cast(IDeformable)target;
        if (!deformable) {
            invalidApplications_++;
            return;
        }

        const currentX = cast(size_t)index.x;
        const currentY = cast(size_t)index.y;
        const nextX = nu_min(currentX + 1, values_.rows - 1);
        const nextY = nu_min(currentY + 1, values_.columns - 1);
        const x = clamp(norm.x, 0.0f, 1.0f);
        const y = clamp(norm.y, 0.0f, 1.0f);
        const vertexCount = values_[currentX, currentY].vertexOffsets.length;

        if (
            !isFinite(x) ||
            !isFinite(y) ||
            vertexCount != deformable.deformPoints.length ||
            values_[nextX, currentY].vertexOffsets.length != vertexCount ||
            values_[currentX, nextY].vertexOffsets.length != vertexCount ||
            values_[nextX, nextY].vertexOffsets.length != vertexCount
        ) {
            invalidApplications_++;
            return;
        }

        // Do not use the generic Deformation arithmetic operators here. They
        // return owning temporary arrays whose copies alias the same storage,
        // which poisons later vertices after a temporary is released.
        interpolated_.clear(vertexCount);
        foreach (vertex; 0 .. vertexCount) {
            vec2 value;
            final switch (interpMode) {
            case InterpolateMode.nearest:
                const sampleX = x >= 0.5f ? nextX : currentX;
                const sampleY =
                    values_.columns > 1 && y >= 0.5f ? nextY : currentY;
                value = values_[sampleX, sampleY].vertexOffsets[vertex];
                break;
            case InterpolateMode.stepped:
                value = values_[currentX, currentY].vertexOffsets[vertex];
                break;
            case InterpolateMode.linear:
                const top =
                    values_[currentX, currentY].vertexOffsets[vertex] *
                        (1.0f - x) +
                    values_[nextX, currentY].vertexOffsets[vertex] * x;
                if (values_.columns == 1) {
                    value = top;
                } else {
                    const bottom =
                        values_[currentX, nextY].vertexOffsets[vertex] *
                            (1.0f - x) +
                        values_[nextX, nextY].vertexOffsets[vertex] * x;
                    value = top * (1.0f - y) + bottom * y;
                }
                break;
            case InterpolateMode.cubic:
                const previousX = currentX > 0 ? currentX - 1 : 0;
                const followingX = nu_min(currentX + 2, values_.rows - 1);
                if (values_.columns == 1) {
                    value = cubic(
                        values_[previousX, 0].vertexOffsets[vertex],
                        values_[currentX, 0].vertexOffsets[vertex],
                        values_[nextX, 0].vertexOffsets[vertex],
                        values_[followingX, 0].vertexOffsets[vertex],
                        x
                    );
                } else {
                    vec2[4] rows;
                    const previousY = currentY > 0 ? currentY - 1 : 0;
                    const followingY =
                        nu_min(currentY + 2, values_.columns - 1);
                    size_t[4] rowIndices;
                    rowIndices[0] = previousY;
                    rowIndices[1] = currentY;
                    rowIndices[2] = nextY;
                    rowIndices[3] = followingY;
                    foreach (row, sampleY; rowIndices) {
                        rows[row] = cubic(
                            values_[previousX, sampleY].vertexOffsets[vertex],
                            values_[currentX, sampleY].vertexOffsets[vertex],
                            values_[nextX, sampleY].vertexOffsets[vertex],
                            values_[followingX, sampleY].vertexOffsets[vertex],
                            x
                        );
                    }
                    value = cubic(rows[0], rows[1], rows[2], rows[3], y);
                }
                break;
            case InterpolateMode.quadratic:
                invalidApplications_++;
                return;
            }
            if (!value.isFinite) {
                invalidApplications_++;
                return;
            }
            interpolated_.vertexOffsets[vertex] = value;
        }
        deformable.deform(interpolated_.vertexOffsets, false);
    }

    override
    bool isCompatibleWith(Node other) const {
        auto current = cast(IDeformable)target;
        auto candidate = cast(IDeformable)other;
        return current && candidate &&
            current.deformPoints.length == candidate.deformPoints.length;
    }

    void resetKeypoint(vec2u index) {
        auto deformable = cast(IDeformable)target;
        values_[index.x, index.y].clear(
            deformable ? deformable.deformPoints.length : 0
        );
    }

    mixin RuntimeParameterBindingEditor!Deformation;
}
mixin Register!(ParameterDeformBinding, in_binding_registry);
