/**
    Parameter binding utilities for the browser compatibility profile.

    Copyright:
        Copyright © 2020-2026, Inochi2D Project
        Copyright © 2026, StarCried contributors

    License:
        BSD 2-clause License
*/
module inochi2d.param.utils;
import inochi2d.core.vector2d;
import inochi2d.core.serde;
import inochi2d.common;
import inochi2d.param;
import numath;
import nulib;
import numem;

/**
    Returns the row/column layout used by legacy Creator binding arrays.
*/
vec2u bindingDimensions(Parameter parameter) @nogc {
    if (parameter.dimensions == 1) {
        return vec2u(parameter.elementCounts[0], 1);
    }
    return vec2u(parameter.elementCounts[0], parameter.elementCounts[1]);
}

/**
    Deserializes Creator 0.7/0.8 nested keypoint arrays.
*/
void deserialize08NestedArrays(T)(
    ref DataNode object,
    ref T target,
    ref ModelState state,
    vec2u dims
) @nogc
if (is(T == vector2d!U, U)) {
    import inochi2d.core.math.deform : Deformation;

    if (!object.isArray) {
        state.error(nstring("expected array, got ", object.type.toTypeName, "!"));
        return;
    }
    if (object.length != dims.x) {
        state.error("binding row count does not match its parameter");
        return;
    }

    target.resize(dims.x, dims.y);
    foreach (x, ref row; object.array) {
        if (!row.isArray) {
            state.error(nstring("expected nested array, got ", row.type.toTypeName, "!"));
            return;
        }
        if (row.length != dims.y) {
            state.error("binding column count does not match its parameter");
            return;
        }
        foreach (y, ref value; row.array) {
            // Deformation owns a manually allocated vertex array. Assigning a
            // deserialized temporary here only copies that array's slice and
            // loses its contents under the SDK's value/move semantics. Decode
            // directly into the destination cell so every keypoint retains
            // its vertex offsets.
            static if (is(U == Deformation)) {
                target[x, y].onDeserialize(value, state);
            } else {
                target[x, y] = value.deserialize!(T.DT)(state);
            }
        }
    }
}

/**
    Resizes a binding vector to match its parameter.
*/
void resizeToParam(T)(ref T values, Parameter parameter) {
    const dims = bindingDimensions(parameter);
    values.resize(dims.x, dims.y);
}

/**
    Bilinearly interpolates a Creator keypoint grid.

    The release profile accepts linear interpolation only. The model pipeline
    rejects other modes before a bundle can be generated.
*/
T interpolateKeypoint(T)(
    ref vector2d!T values,
    vec2u index,
    vec2 norm
) @nogc {
    assert(values.rows > 0 && values.columns > 0);
    assert(index.x < values.rows);
    assert(index.y < values.columns);

    const nextX = nu_min(cast(size_t)index.x + 1, values.rows - 1);
    const nextY = nu_min(cast(size_t)index.y + 1, values.columns - 1);
    const x = clamp(norm.x, 0.0f, 1.0f);
    const y = clamp(norm.y, 0.0f, 1.0f);

    auto top = values[index.x, index.y] * (1.0f - x) +
        values[nextX, index.y] * x;
    if (values.columns == 1) {
        return top;
    }

    auto bottom = values[index.x, nextY] * (1.0f - x) +
        values[nextX, nextY] * x;
    return top * (1.0f - y) + bottom * y;
}
