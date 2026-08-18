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
    bool legacyComposition_;
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
            legacyComposition_ = true;
            object.tryGetRef(state, property_, "param_name");
            // The 0.8 spelling predates the lowercase 0.9 property quark.
            if (property_ == "zSort")
                property_ = "zsort";
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
        const value = interpolateKeypoint(values_, index, norm, interpMode);
        if (!isFinite(value)) {
            invalidApplications_++;
            return;
        }
        const key = nu_quarkof(property_[]);
        if (!target.hasProperty(key)) {
            invalidApplications_++;
            return;
        }

        float composed = value;
        if (legacyComposition_) {
            // Creator 0.8 accumulated bindings that target the same property.
            // The unfinished 0.9 binding surface only exposes setProperty(),
            // so reproduce the old per-property merge rules here.
            switch (property_[]) {
            case "zsort":
            case "transform.t.x":
            case "transform.t.y":
            case "transform.t.z":
            case "transform.r.x":
            case "transform.r.y":
            case "transform.r.z":
            case "screenTint.r":
            case "screenTint.g":
            case "screenTint.b":
            case "emissionStrength":
            case "length":
                composed = target.getProperty(key) + value;
                break;
            case "alphaThreshold":
            case "opacity":
            case "tint.r":
            case "tint.g":
            case "tint.b":
            case "transform.s.x":
            case "transform.s.y":
            case "gravity":
            case "frequency":
            case "angleDamping":
            case "lengthDamping":
            case "outputScale.x":
            case "outputScale.y":
                composed = target.getProperty(key) * value;
                break;
            default:
                break;
            }
        }
        if (!isFinite(composed)) {
            invalidApplications_++;
            return;
        }
        target.setProperty(key, composed);
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
