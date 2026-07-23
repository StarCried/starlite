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
        auto deformable = cast(IDeformable)target;
        if (!deformable)
            return;

        const nextX = nu_min(cast(size_t)index.x + 1, values_.rows - 1);
        const nextY = nu_min(cast(size_t)index.y + 1, values_.columns - 1);
        const x = clamp(norm.x, 0.0f, 1.0f);
        const y = clamp(norm.y, 0.0f, 1.0f);
        const vertexCount = values_[index.x, index.y].vertexOffsets.length;

        if (
            !isFinite(x) ||
            !isFinite(y) ||
            vertexCount != deformable.deformPoints.length ||
            values_[nextX, index.y].vertexOffsets.length != vertexCount ||
            values_[index.x, nextY].vertexOffsets.length != vertexCount ||
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
            const top =
                values_[index.x, index.y].vertexOffsets[vertex] * (1.0f - x) +
                values_[nextX, index.y].vertexOffsets[vertex] * x;
            const bottom =
                values_[index.x, nextY].vertexOffsets[vertex] * (1.0f - x) +
                values_[nextX, nextY].vertexOffsets[vertex] * x;
            const value = top * (1.0f - y) + bottom * y;
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
