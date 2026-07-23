/**
    Runtime-compatible node parameter bindings for the browser build.

    This file completes the currently disabled binding implementation in the
    official Inochi2D D SDK. Editing operations remain intentionally out of
    scope; model loading, finalization, interpolation and application are the
    supported browser profile.

    Copyright:
        Copyright © 2020-2026, Inochi2D Project
        Copyright © 2026, StarCried contributors

    License:
        BSD 2-clause License
*/
module inochi2d.param.bindings.node;
import inochi2d.param.parameters;
import inochi2d.param.bindings;
import inochi2d.param.utils;
import inochi2d.core.vector2d;
import inochi2d.core.serde;
import inochi2d.core.math;
import inochi2d.core.guid;
import inochi2d.common;
import inochi2d.puppet;
import inochi2d.nodes;
import nulib;
import numem;

/**
    A parameter binding affecting one puppet node.
*/
abstract
class ParameterNodeBinding : ParameterBinding {
private:
@nogc:
    GUID nodeId_;
    Node target_;

protected:
    vector2d!bool defined_;

    override
    void onSerialize(ref DataNode object) {
        super.onSerialize(object);
        if (target_) {
            object["target"] = target_.guid.toString()[];
        }
        object["defined"] = defined_.data.serialize();
    }

    override
    void onDeserialize(ref DataNode object, ref ModelState state) {
        super.onDeserialize(object, state);
        nodeId_ = object.tryGetGUID(state, "node", "target");

        const dims = bindingDimensions(parameter);
        if ("isSet" in object) {
            object["isSet"].deserialize08NestedArrays(defined_, state, dims);
        } else if ("defined" in object) {
            object["defined"].deserialize08NestedArrays(defined_, state, dims);
        }
    }

    override
    void onFinalize(Puppet puppet, ref ModelState state) {
        this.target = puppet.find!Node(nodeId_);
        if (!target_) {
            state.warning(nstring("Parameter binding target was not found: ", nodeId_.toString()));
        }
    }

public:
    @property inout(Node) target() inout => target_;
    @property void target(Node value) {
        if (target_ is value)
            return;
        if (target_)
            target_.release();
        target_ = value ? value.retained : null;
    }

    this(Parameter param) {
        super(param);
        const dims = bindingDimensions(param);
        defined_.resize(dims.x, dims.y);
    }

    this(Parameter param, Node node) {
        this(param);
        this.target = node;
    }

    ~this() {
        if (target_)
            target_.release();
    }
}

/**
    Implements the non-rendering binding editor surface required by the SDK.

    The browser runtime never mutates keypoint layouts. Unsupported editor
    operations assert so they cannot silently corrupt a loaded model.
*/
mixin template RuntimeParameterBindingEditor(T) {
    override
    void insertKeypoint(ParameterAxis axis, uint index) {
        assert(false, "Browser runtime does not edit parameter keypoints.");
    }

    override
    void moveKeypoint(ParameterAxis axis, uint index, uint dest) {
        assert(false, "Browser runtime does not edit parameter keypoints.");
    }

    override
    void deleteKeypoint(ParameterAxis axis, uint index) {
        assert(false, "Browser runtime does not edit parameter keypoints.");
    }

    override
    void scaleKeypoint(ParameterAxis axis, uint index, float scale) {
        assert(false, "Browser runtime does not edit parameter keypoints.");
    }

    override
    void copyKeypoint(vec2u index, ParameterBinding other, vec2u dest) {
        assert(false, "Browser runtime does not edit parameter keypoints.");
    }

    override
    void clear() {
        defined_[] = false;
    }

    override
    void enable(vec2u index) {
        defined_[index.x, index.y] = true;
    }

    override
    void reset(vec2u index) {
        resetKeypoint(index);
        defined_[index.x, index.y] = true;
    }

    override
    void disable(vec2u index) {
        resetKeypoint(index);
        defined_[index.x, index.y] = false;
    }

    override
    void fillBlanks() {
        // Creator exports already contain interpolated values for unset points.
    }

    override
    bool isDefined(uint index) const {
        return index < defined_.length && defined_.data[index];
    }
}
