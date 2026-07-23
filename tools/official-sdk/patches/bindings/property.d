/**
    Runtime property parameter bindings for the browser build.

    Copyright:
        Copyright © 2020-2026, Inochi2D Project
        Copyright © 2026, StarCried contributors

    License:
        BSD 2-clause License
*/
module inochi2d.param.bindings.property;
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
import nulib;
import numem;

/**
    A parameter binding to one numeric node property.
*/
@TypeId("property", IN_MAKE_TAG!(0, 0))
class ParameterPropertyBinding : ParameterNodeBinding {
private:
@nogc:
    vector2d!float values_;
    nstring property_;
    uint invalidApplications_;

protected:
    override
    void onSerialize(ref DataNode object) {
        super.onSerialize(object);
        object["property"] = property_[];
        object["values"] = values_.data.serialize();
    }

    override
    void onDeserialize(ref DataNode object, ref ModelState state) {
        super.onDeserialize(object, state);
        if ("param_name" in object) {
            object.tryGetRef(state, property_, "param_name");
        } else {
            object.tryGetRef(state, property_, "property");
        }

        if ("values" in object) {
            object["values"].deserialize08NestedArrays(
                values_,
                state,
                bindingDimensions(parameter)
            );
        }
    }

public:
    @property slice2d!float values() => values_[];
    @property string property() => property_[];
    @property uint invalidApplications() const => invalidApplications_;

    this(Parameter param) {
        super(param);
        const dims = bindingDimensions(param);
        values_.resize(dims.x, dims.y);
    }

    this(Parameter param, Node node, string property) {
        this(param);
        this.target = node;
        this.property_ = property;
    }

    override
    void apply(vec2u index, vec2 norm) {
        if (!target)
            return;
        const value = interpolateKeypoint(values_, index, norm);
        if (!isFinite(value)) {
            invalidApplications_++;
            return;
        }
        target.setProperty(nu_quarkof(property_[]), value);
    }

    override
    bool isCompatibleWith(Node other) const {
        return other && other.hasProperty(nu_quarkof(property_[]));
    }

    void resetKeypoint(vec2u index) {
        if (target) {
            values_[index.x, index.y] = target.getPropertyDefault(nu_quarkof(property_[]));
        } else {
            values_[index.x, index.y] = 0;
        }
    }

    mixin RuntimeParameterBindingEditor!float;
}
mixin Register!(ParameterPropertyBinding, in_binding_registry);
