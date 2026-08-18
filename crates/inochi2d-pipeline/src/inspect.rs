use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::Cursor;

use image::{ImageFormat, ImageReader};
use serde_json::{Map, Value};

use crate::container::InpDocument;
use crate::model::{
    AnimationAxis, AnimationClip, AnimationInterpolation, AnimationKeyframe, AnimationLane,
    CompatibilityReport, ContentIdentity, InspectionReport, Issue, IssueSeverity, MetadataReport,
    NodeSummary, ParameterProfile, PublicationReport, TextureFormat, TextureInspection,
    MANIFEST_SCHEMA_VERSION,
};
use crate::{sha256_hex, PipelineError, Result};

const MAX_TEXTURE_DIMENSION: u32 = 4096;
const MAX_SOURCE_TEXTURE_DIMENSION: u32 = 8192;
const MAX_SOURCE_TEXTURE_PIXELS: u64 = 32 * 1024 * 1024;
const MODEL_SIZE_BUDGET: u64 = 8 * 1024 * 1024;
const MAX_PARAMETER_COUNT: usize = 4096;
const MAX_BINDING_COUNT: usize = 65_536;
const MAX_NODE_COUNT: usize = 4096;
const MAX_NODE_DEPTH: usize = 32;
const MAX_ANIMATION_COUNT: usize = 64;
const MAX_ANIMATION_NAME_BYTES: usize = 128;
const MAX_ANIMATION_LANES: usize = 128;
const MAX_ANIMATION_KEYFRAMES: usize = 4096;
const MAX_ANIMATION_LENGTH: u64 = 18_000;
const MAX_ANIMATION_TIMESTEP_SECONDS: f64 = 1.0;
const SUPPORTED_BLEND_MODE_IDS: &[u64] = &[0, 1, 2, 5, 6, 7, 8, 9, 15, 16, 17, 18];
const SUPPORTED_BLEND_MODE_NAMES: &[&str] = &[
    "Normal",
    "Multiply",
    "Screen",
    "Lighten",
    "ColorDodge",
    "LinearDodge",
    "AddGlow",
    "ColorBurn",
    "Inverse",
    "DestinationIn",
    "ClipToLower",
    "SliceFromLower",
];

#[derive(Clone, Debug)]
struct NodeRecord {
    uuid: Option<u64>,
    name: Option<String>,
    node_type: Option<String>,
    masks: Vec<u64>,
}

pub fn inspect(source_bytes: &[u8], document: &InpDocument) -> Result<InspectionReport> {
    let mut compatibility_issues = Vec::new();
    let textures = inspect_textures(document, &mut compatibility_issues)?;
    if source_bytes.len() as u64 > MODEL_SIZE_BUDGET {
        compatibility_issues.push(issue(
            "source_model_over_size_budget",
            IssueSeverity::Warning,
            format!(
                "source model is {} bytes; the web target is at most {MODEL_SIZE_BUDGET} bytes",
                source_bytes.len()
            ),
            None,
        ));
    }

    let payload = document.payload_json.as_object().ok_or_else(|| {
        PipelineError::InvalidContainer("the JSON payload root must be an object".to_owned())
    })?;
    let metadata = inspect_metadata(payload, &mut compatibility_issues);
    let parameters = inspect_parameters(payload, &mut compatibility_issues);
    let animations = inspect_animations(payload, &parameters, &mut compatibility_issues);
    let nodes = inspect_nodes(payload, document.textures.len(), &mut compatibility_issues);

    if payload.get("automation").is_some_and(has_content) {
        compatibility_issues.push(issue(
            "built_in_automation_unsupported",
            IssueSeverity::Error,
            "built-in automation data is outside the first browser runtime scope",
            None,
        ));
    }

    let publication = inspect_publication(&metadata);
    let supported = !compatibility_issues
        .iter()
        .any(|item| item.severity == IssueSeverity::Error);

    Ok(InspectionReport {
        schema_version: MANIFEST_SCHEMA_VERSION,
        source: ContentIdentity {
            sha256: sha256_hex(source_bytes),
            bytes: source_bytes.len() as u64,
        },
        payload_bytes: document.payload.len() as u64,
        vendor_count: document.vendor_count,
        metadata,
        parameters,
        animations,
        nodes,
        textures,
        compatibility: CompatibilityReport {
            supported,
            issues: compatibility_issues,
        },
        publication,
    })
}

fn inspect_textures(
    document: &InpDocument,
    issues: &mut Vec<Issue>,
) -> Result<Vec<TextureInspection>> {
    document
        .textures
        .iter()
        .enumerate()
        .map(|(index, texture)| {
            if texture.format == TextureFormat::Bc7 {
                issues.push(issue(
                    "bc7_texture_unsupported",
                    IssueSeverity::Error,
                    format!("texture {index} uses BC7, which the browser runtime cannot decode"),
                    None,
                ));
                return Ok(TextureInspection {
                    index,
                    format: texture.format,
                    width: None,
                    height: None,
                    bytes: texture.data.len() as u64,
                });
            }

            let format = image_format(texture.format);
            // Header inspection is intentionally allocation-free. Large
            // source textures are accepted for deterministic resizing during
            // build, while impossible or abusive dimensions still fail closed.
            let (width, height) = ImageReader::with_format(Cursor::new(&texture.data), format)
                .into_dimensions()
                .map_err(|source| PipelineError::TextureDecode {
                    index,
                    format: texture.format.label(),
                    source,
                })?;
            let pixels = u64::from(width) * u64::from(height);
            if width > MAX_SOURCE_TEXTURE_DIMENSION
                || height > MAX_SOURCE_TEXTURE_DIMENSION
                || pixels > MAX_SOURCE_TEXTURE_PIXELS
            {
                issues.push(issue(
                    "texture_source_dimension_unsupported",
                    IssueSeverity::Error,
                    format!(
                        "texture {index} is {width}x{height}; source textures are limited to \
                         {MAX_SOURCE_TEXTURE_DIMENSION}px per dimension and \
                         {MAX_SOURCE_TEXTURE_PIXELS} pixels"
                    ),
                    None,
                ));
            }
            if width > MAX_TEXTURE_DIMENSION || height > MAX_TEXTURE_DIMENSION {
                issues.push(issue(
                    "texture_resize_required",
                    IssueSeverity::Warning,
                    format!(
                        "texture {index} is {width}x{height}; build will preserve its aspect ratio \
                         and resize it to at most {MAX_TEXTURE_DIMENSION}px per dimension"
                    ),
                    None,
                ));
            }

            Ok(TextureInspection {
                index,
                format: texture.format,
                width: Some(width),
                height: Some(height),
                bytes: texture.data.len() as u64,
            })
        })
        .collect()
}

fn inspect_metadata(payload: &Map<String, Value>, issues: &mut Vec<Issue>) -> MetadataReport {
    let Some(meta) = payload.get("meta").and_then(Value::as_object) else {
        issues.push(issue(
            "metadata_missing",
            IssueSeverity::Error,
            "payload.meta must be an object",
            None,
        ));
        return empty_metadata();
    };

    MetadataReport {
        name: optional_string(meta, "name"),
        version: optional_string(meta, "version"),
        rigger: optional_string(meta, "rigger"),
        artist: optional_string(meta, "artist"),
        copyright: optional_string(meta, "copyright"),
        license_url: optional_string(meta, "licenseURL"),
        contact: optional_string(meta, "contact"),
        reference: optional_string(meta, "reference"),
        rights: meta.get("rights").filter(|value| !value.is_null()).cloned(),
    }
}

fn inspect_parameters(
    payload: &Map<String, Value>,
    issues: &mut Vec<Issue>,
) -> Vec<ParameterProfile> {
    let Some(parameters) = payload.get("param").and_then(Value::as_array) else {
        issues.push(issue(
            "parameters_missing",
            IssueSeverity::Error,
            "payload.param must be an array",
            None,
        ));
        return Vec::new();
    };
    if parameters.len() > MAX_PARAMETER_COUNT {
        issues.push(issue(
            "parameter_count_unsupported",
            IssueSeverity::Error,
            format!(
                "model contains {} parameters; the limit is {MAX_PARAMETER_COUNT}",
                parameters.len()
            ),
            None,
        ));
    }

    let mut names = HashMap::<String, (Option<u64>, Map<String, Value>)>::new();
    let mut uuids = HashMap::<u64, String>::new();
    let mut binding_count = 0_usize;
    parameters
        .iter()
        .take(MAX_PARAMETER_COUNT)
        .enumerate()
        .filter_map(|(index, value)| {
            let Some(parameter) = value.as_object() else {
                issues.push(issue(
                    "parameter_schema_invalid",
                    IssueSeverity::Error,
                    format!("parameter {index} must be an object"),
                    None,
                ));
                return None;
            };

            let Some(name) = parameter.get("name").and_then(Value::as_str) else {
                issues.push(issue(
                    "parameter_schema_invalid",
                    IssueSeverity::Error,
                    format!("parameter {index} has no string name"),
                    None,
                ));
                return None;
            };
            let Some(is_vector) = parameter.get("is_vec2").and_then(Value::as_bool) else {
                issues.push(issue(
                    "parameter_schema_invalid",
                    IssueSeverity::Error,
                    format!("parameter {name:?} has no boolean is_vec2 value"),
                    None,
                ));
                return None;
            };
            let uuid = parameter.get("uuid").and_then(Value::as_u64);
            if let Some(uuid) = uuid {
                if let Some(existing_name) = uuids.get(&uuid) {
                    if existing_name != name {
                        issues.push(issue(
                            "parameter_uuid_duplicate",
                            IssueSeverity::Error,
                            format!(
                                "parameter UUID {uuid} is shared by {existing_name:?} and {name:?}"
                            ),
                            None,
                        ));
                    }
                } else {
                    uuids.insert(uuid, name.to_owned());
                }
            }
            let mut signature = parameter.clone();
            signature.remove("bindings");
            if let Some((existing_uuid, existing_signature)) = names.get(name) {
                if uuid.is_some() && *existing_uuid == uuid && *existing_signature == signature {
                    issues.push(issue(
                        "parameter_alias_merged",
                        IssueSeverity::Warning,
                        format!(
                            "parameter name {name:?} is split across entries with the same UUID; their bindings will be merged"
                        ),
                        None,
                    ));
                } else {
                    issues.push(issue(
                        "parameter_name_duplicate",
                        IssueSeverity::Error,
                        format!(
                            "parameter name {name:?} is duplicated with different or missing UUIDs"
                        ),
                        None,
                    ));
                }
            } else {
                names.insert(name.to_owned(), (uuid, signature));
            }

            let Some(min) = vec2(parameter.get("min")) else {
                push_parameter_vec_issue(issues, name, "min");
                return None;
            };
            let Some(max) = vec2(parameter.get("max")) else {
                push_parameter_vec_issue(issues, name, "max");
                return None;
            };
            let Some(defaults) = vec2(parameter.get("defaults")) else {
                push_parameter_vec_issue(issues, name, "defaults");
                return None;
            };
            validate_parameter_range(name, is_vector, min, max, defaults, issues);
            validate_axis_points(name, is_vector, parameter.get("axis_points"), issues);
            validate_bindings(name, parameter.get("bindings"), &mut binding_count, issues);

            Some(ParameterProfile {
                uuid,
                name: name.to_owned(),
                is_vector,
                min,
                max,
                defaults,
            })
        })
        .collect()
}

fn inspect_animations(
    payload: &Map<String, Value>,
    parameters: &[ParameterProfile],
    issues: &mut Vec<Issue>,
) -> Vec<AnimationClip> {
    let Some(value) = payload.get("animations") else {
        return Vec::new();
    };
    if value.is_null() {
        return Vec::new();
    }
    let Some(animations) = value.as_object() else {
        push_animation_issue(
            issues,
            "animation_schema_invalid",
            "payload.animations must be an object or null",
        );
        return Vec::new();
    };
    if animations.len() > MAX_ANIMATION_COUNT {
        push_animation_issue(
            issues,
            "animation_count_unsupported",
            format!(
                "model contains {} animations; the browser limit is {MAX_ANIMATION_COUNT}",
                animations.len()
            ),
        );
    }

    let parameters_by_uuid = parameters
        .iter()
        .filter_map(|parameter| parameter.uuid.map(|uuid| (uuid, parameter)))
        .collect::<HashMap<_, _>>();
    let mut sorted = animations.iter().collect::<Vec<_>>();
    sorted.sort_unstable_by(|(left, _), (right, _)| left.cmp(right));
    sorted
        .into_iter()
        .take(MAX_ANIMATION_COUNT)
        .filter_map(|(name, value)| inspect_animation(name, value, &parameters_by_uuid, issues))
        .collect()
}

fn inspect_animation(
    name: &str,
    value: &Value,
    parameters: &HashMap<u64, &ParameterProfile>,
    issues: &mut Vec<Issue>,
) -> Option<AnimationClip> {
    let issue_count = issues.len();
    if name.trim().is_empty() || name.len() > MAX_ANIMATION_NAME_BYTES {
        push_animation_issue(
            issues,
            "animation_name_invalid",
            format!("animation names must contain 1..={MAX_ANIMATION_NAME_BYTES} UTF-8 bytes"),
        );
        return None;
    }
    let Some(animation) = value.as_object() else {
        push_animation_issue(
            issues,
            "animation_schema_invalid",
            format!("animation {name:?} must be an object"),
        );
        return None;
    };

    let timestep = finite_number(animation, "timestep");
    let length = unsigned_integer(animation, "length");
    let lead_in = signed_integer(animation, "leadIn");
    let lead_out = signed_integer(animation, "leadOut");
    let weight = finite_number(animation, "animationWeight");
    let additive = animation.get("additive").and_then(Value::as_bool);
    if timestep.is_none()
        || length.is_none()
        || lead_in.is_none()
        || lead_out.is_none()
        || weight.is_none()
        || additive.is_none()
    {
        push_animation_issue(
            issues,
            "animation_schema_invalid",
            format!(
                "animation {name:?} must contain timestep, additive, length, leadIn, leadOut, and animationWeight"
            ),
        );
        return None;
    }
    let (timestep, length, lead_in, lead_out, weight, additive) = (
        timestep.expect("checked"),
        length.expect("checked"),
        lead_in.expect("checked"),
        lead_out.expect("checked"),
        weight.expect("checked"),
        additive.expect("checked"),
    );
    if !(0.0..=MAX_ANIMATION_TIMESTEP_SECONDS).contains(&timestep) || timestep == 0.0 {
        push_animation_issue(
            issues,
            "animation_timestep_unsupported",
            format!(
                "animation {name:?} timestep must be greater than 0 and at most {MAX_ANIMATION_TIMESTEP_SECONDS} second"
            ),
        );
    }
    if length == 0 || length > MAX_ANIMATION_LENGTH {
        push_animation_issue(
            issues,
            "animation_length_unsupported",
            format!("animation {name:?} length must be within 1..={MAX_ANIMATION_LENGTH} frames"),
        );
    }
    if !(-1..=length as i64).contains(&lead_in) || !(-1..=length as i64).contains(&lead_out) {
        push_animation_issue(
            issues,
            "animation_timing_invalid",
            format!("animation {name:?} leadIn and leadOut must be -1 or fall within its length"),
        );
    }
    if weight != 1.0 {
        push_animation_issue(
            issues,
            "animation_weight_unsupported",
            format!("animation {name:?} animationWeight must be 1 for forced alpha playback"),
        );
    }
    if additive {
        push_animation_issue(
            issues,
            "additive_animation_unsupported",
            format!("animation {name:?} is additive; alpha playback supports forced lanes only"),
        );
    }

    let Some(raw_lanes) = animation.get("lanes").and_then(Value::as_array) else {
        push_animation_issue(
            issues,
            "animation_schema_invalid",
            format!("animation {name:?} lanes must be an array"),
        );
        return None;
    };
    if raw_lanes.is_empty() || raw_lanes.len() > MAX_ANIMATION_LANES {
        push_animation_issue(
            issues,
            "animation_lane_count_unsupported",
            format!("animation {name:?} must contain 1..={MAX_ANIMATION_LANES} lanes"),
        );
    }

    let mut targets = HashSet::new();
    let mut total_keyframes = 0_usize;
    let lanes = raw_lanes
        .iter()
        .take(MAX_ANIMATION_LANES)
        .enumerate()
        .filter_map(|(index, lane)| {
            inspect_animation_lane(
                name,
                index,
                lane,
                length,
                parameters,
                &mut targets,
                &mut total_keyframes,
                issues,
            )
        })
        .collect::<Vec<_>>();

    if issues.len() != issue_count {
        return None;
    }
    Some(AnimationClip {
        name: name.to_owned(),
        timestep_ms: timestep * 1000.0,
        length: length as u32,
        lead_in: lead_in as i32,
        lead_out: lead_out as i32,
        weight,
        lanes,
    })
}

#[allow(clippy::too_many_arguments)]
fn inspect_animation_lane(
    animation_name: &str,
    index: usize,
    value: &Value,
    animation_length: u64,
    parameters: &HashMap<u64, &ParameterProfile>,
    targets: &mut HashSet<(u64, Option<AnimationAxis>)>,
    total_keyframes: &mut usize,
    issues: &mut Vec<Issue>,
) -> Option<AnimationLane> {
    let Some(lane) = value.as_object() else {
        push_animation_issue(
            issues,
            "animation_lane_schema_invalid",
            format!("animation {animation_name:?} lane {index} must be an object"),
        );
        return None;
    };
    let Some(uuid) = lane.get("uuid").and_then(Value::as_u64) else {
        push_animation_issue(
            issues,
            "animation_lane_schema_invalid",
            format!("animation {animation_name:?} lane {index} has no unsigned uuid"),
        );
        return None;
    };
    let Some(parameter) = parameters.get(&uuid) else {
        push_animation_issue(
            issues,
            "animation_parameter_unknown",
            format!(
                "animation {animation_name:?} lane {index} references unknown parameter UUID {uuid}"
            ),
        );
        return None;
    };
    let Some(axis) = animation_axis(lane.get("target"), parameter.is_vector) else {
        push_animation_issue(
            issues,
            "animation_lane_target_unsupported",
            format!(
                "animation {animation_name:?} lane {index} has an unsupported target for parameter {:?}",
                parameter.name
            ),
        );
        return None;
    };
    if !targets.insert((uuid, axis)) {
        push_animation_issue(
            issues,
            "animation_lane_duplicate",
            format!(
                "animation {animation_name:?} contains duplicate lanes for parameter {:?}",
                parameter.name
            ),
        );
        return None;
    }
    if !forced_merge_mode(lane.get("merge_mode")) {
        push_animation_issue(
            issues,
            "animation_merge_mode_unsupported",
            format!("animation {animation_name:?} lane {index} must use the Forced merge mode"),
        );
        return None;
    }
    let Some(interpolation) = animation_interpolation(lane.get("interpolation")) else {
        push_animation_issue(
            issues,
            "animation_interpolation_unsupported",
            format!("animation {animation_name:?} lane {index} uses an unsupported interpolation"),
        );
        return None;
    };
    let Some(raw_keyframes) = lane.get("keyframes").and_then(Value::as_array) else {
        push_animation_issue(
            issues,
            "animation_lane_schema_invalid",
            format!("animation {animation_name:?} lane {index} keyframes must be an array"),
        );
        return None;
    };
    *total_keyframes = total_keyframes.saturating_add(raw_keyframes.len());
    if raw_keyframes.len() < 2 || *total_keyframes > MAX_ANIMATION_KEYFRAMES {
        push_animation_issue(
            issues,
            "animation_keyframe_count_unsupported",
            format!(
                "animation {animation_name:?} must have at least two keyframes per lane and at most {MAX_ANIMATION_KEYFRAMES} total"
            ),
        );
        return None;
    }

    let mut previous_frame = None;
    let mut keyframes = Vec::with_capacity(raw_keyframes.len());
    for (keyframe_index, raw_keyframe) in raw_keyframes.iter().enumerate() {
        let Some(keyframe) = raw_keyframe.as_object() else {
            push_animation_issue(
                issues,
                "animation_keyframe_schema_invalid",
                format!(
                    "animation {animation_name:?} lane {index} keyframe {keyframe_index} must be an object"
                ),
            );
            return None;
        };
        let Some(frame) = unsigned_integer(keyframe, "frame") else {
            push_animation_issue(
                issues,
                "animation_keyframe_schema_invalid",
                format!(
                    "animation {animation_name:?} lane {index} keyframe {keyframe_index} has no unsigned frame"
                ),
            );
            return None;
        };
        let Some(value) = finite_number(keyframe, "value") else {
            push_animation_issue(
                issues,
                "animation_keyframe_schema_invalid",
                format!(
                    "animation {animation_name:?} lane {index} keyframe {keyframe_index} has no finite value"
                ),
            );
            return None;
        };
        let Some(tension) = finite_number(keyframe, "tension") else {
            push_animation_issue(
                issues,
                "animation_keyframe_schema_invalid",
                format!(
                    "animation {animation_name:?} lane {index} keyframe {keyframe_index} has no finite tension"
                ),
            );
            return None;
        };
        if frame > animation_length || previous_frame.is_some_and(|previous| frame <= previous) {
            push_animation_issue(
                issues,
                "animation_keyframe_order_invalid",
                format!(
                    "animation {animation_name:?} lane {index} keyframes must be strictly increasing and within the animation length"
                ),
            );
            return None;
        }
        let axis_index = usize::from(axis == Some(AnimationAxis::Y));
        if value < parameter.min[axis_index] || value > parameter.max[axis_index] {
            push_animation_issue(
                issues,
                "animation_keyframe_value_invalid",
                format!(
                    "animation {animation_name:?} lane {index} keyframe value {value} is outside parameter {:?} range",
                    parameter.name
                ),
            );
            return None;
        }
        previous_frame = Some(frame);
        keyframes.push(AnimationKeyframe {
            frame: frame as u32,
            value,
            tension,
        });
    }
    Some(AnimationLane {
        parameter: parameter.name.clone(),
        axis,
        default_values: parameter.defaults,
        interpolation,
        keyframes,
    })
}

fn animation_axis(value: Option<&Value>, is_vector: bool) -> Option<Option<AnimationAxis>> {
    let target = value?.as_u64()?;
    if is_vector {
        match target {
            0 => Some(Some(AnimationAxis::X)),
            1 => Some(Some(AnimationAxis::Y)),
            _ => None,
        }
    } else {
        match target {
            0 => Some(None),
            _ => None,
        }
    }
}

fn forced_merge_mode(value: Option<&Value>) -> bool {
    value.and_then(Value::as_str) == Some("Forced")
}

fn animation_interpolation(value: Option<&Value>) -> Option<AnimationInterpolation> {
    match value.and_then(Value::as_str) {
        Some("Nearest") => Some(AnimationInterpolation::Nearest),
        Some("Stepped") => Some(AnimationInterpolation::Stepped),
        Some("Linear") => Some(AnimationInterpolation::Linear),
        Some("Cubic") => Some(AnimationInterpolation::Cubic),
        _ => None,
    }
}

fn finite_number(object: &Map<String, Value>, key: &str) -> Option<f64> {
    object
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}

fn unsigned_integer(object: &Map<String, Value>, key: &str) -> Option<u64> {
    object.get(key).and_then(Value::as_u64)
}

fn signed_integer(object: &Map<String, Value>, key: &str) -> Option<i64> {
    object.get(key).and_then(Value::as_i64)
}

fn push_animation_issue(issues: &mut Vec<Issue>, code: &'static str, message: impl Into<String>) {
    issues.push(issue(code, IssueSeverity::Error, message, None));
}

fn validate_parameter_range(
    name: &str,
    is_vector: bool,
    min: [f64; 2],
    max: [f64; 2],
    defaults: [f64; 2],
    issues: &mut Vec<Issue>,
) {
    let dimensions = if is_vector { 2 } else { 1 };
    for axis in 0..dimensions {
        if !min[axis].is_finite()
            || !max[axis].is_finite()
            || !defaults[axis].is_finite()
            || min[axis] >= max[axis]
        {
            issues.push(issue(
                "parameter_range_invalid",
                IssueSeverity::Error,
                format!("parameter {name:?} axis {axis} must have finite min < max"),
                None,
            ));
        } else if defaults[axis] < min[axis] || defaults[axis] > max[axis] {
            issues.push(issue(
                "parameter_default_out_of_range",
                IssueSeverity::Error,
                format!("parameter {name:?} axis {axis} default is outside min/max"),
                None,
            ));
        }
    }
}

fn validate_axis_points(
    name: &str,
    is_vector: bool,
    value: Option<&Value>,
    issues: &mut Vec<Issue>,
) {
    let Some(axes) = value.and_then(Value::as_array) else {
        issues.push(issue(
            "parameter_axis_points_invalid",
            IssueSeverity::Error,
            format!("parameter {name:?} must contain Creator axis_points"),
            None,
        ));
        return;
    };
    let dimensions = if is_vector { 2 } else { 1 };
    if axes.len() < dimensions {
        issues.push(issue(
            "parameter_axis_points_invalid",
            IssueSeverity::Error,
            format!("parameter {name:?} has fewer axis arrays than its dimensionality"),
            None,
        ));
        return;
    }
    for (axis_index, axis) in axes.iter().take(dimensions).enumerate() {
        let Some(points) = axis.as_array() else {
            issues.push(issue(
                "parameter_axis_points_invalid",
                IssueSeverity::Error,
                format!("parameter {name:?} axis {axis_index} is not an array"),
                None,
            ));
            continue;
        };
        if points.len() < 2
            || points
                .iter()
                .any(|point| point.as_f64().is_none_or(|number| !number.is_finite()))
            || points.windows(2).any(|pair| {
                pair[0].as_f64().expect("validated numeric point")
                    >= pair[1].as_f64().expect("validated numeric point")
            })
        {
            issues.push(issue(
                "parameter_axis_points_invalid",
                IssueSeverity::Error,
                format!(
                    "parameter {name:?} axis {axis_index} must contain at least two strictly increasing finite numbers"
                ),
                None,
            ));
        }
    }
}

fn validate_bindings(
    parameter_name: &str,
    value: Option<&Value>,
    total: &mut usize,
    issues: &mut Vec<Issue>,
) {
    let Some(bindings) = value.and_then(Value::as_array) else {
        issues.push(issue(
            "parameter_bindings_invalid",
            IssueSeverity::Error,
            format!("parameter {parameter_name:?} bindings must be an array"),
            None,
        ));
        return;
    };
    *total = total.saturating_add(bindings.len());
    if *total > MAX_BINDING_COUNT
        && !issues
            .iter()
            .any(|item| item.code == "parameter_binding_count_unsupported")
    {
        issues.push(issue(
            "parameter_binding_count_unsupported",
            IssueSeverity::Error,
            format!("model contains more than {MAX_BINDING_COUNT} parameter bindings"),
            None,
        ));
    }
    for (index, binding) in bindings.iter().enumerate() {
        let Some(binding) = binding.as_object() else {
            issues.push(issue(
                "parameter_binding_schema_invalid",
                IssueSeverity::Error,
                format!("parameter {parameter_name:?} binding {index} is not an object"),
                None,
            ));
            continue;
        };
        if let Some(mode) = binding.get("interpolate_mode") {
            let supported = mode
                .as_u64()
                .is_some_and(|value| matches!(value, 0 | 1 | 2 | 4))
                || mode.as_str().is_some_and(|name| {
                    ["nearest", "linear", "stepped", "cubic"]
                        .iter()
                        .any(|supported| name.eq_ignore_ascii_case(supported))
                });
            if !supported {
                issues.push(issue(
                    "binding_interpolation_unsupported",
                    IssueSeverity::Error,
                    format!(
                        "parameter {parameter_name:?} binding {index} uses unsupported interpolation {mode}"
                    ),
                    None,
                ));
            }
        }
        let legacy = binding
            .get("param_name")
            .and_then(Value::as_str)
            .is_some_and(|property| !property.trim().is_empty())
            && binding.get("node").and_then(Value::as_u64).is_some();
        let typed = binding
            .get("type")
            .and_then(Value::as_str)
            .is_some_and(|kind| kind == "property" || kind == "deform")
            && binding.get("target").is_some();
        if !legacy && !typed {
            issues.push(issue(
                "parameter_binding_schema_invalid",
                IssueSeverity::Error,
                format!(
                    "parameter {parameter_name:?} binding {index} is neither a supported Creator binding nor a supported typed binding"
                ),
                None,
            ));
        }
    }
}

fn inspect_nodes(
    payload: &Map<String, Value>,
    texture_count: usize,
    issues: &mut Vec<Issue>,
) -> NodeSummary {
    let mut records = Vec::new();
    let Some(root) = payload.get("nodes") else {
        issues.push(issue(
            "nodes_missing",
            IssueSeverity::Error,
            "payload.nodes is missing",
            None,
        ));
        return NodeSummary {
            count: 0,
            types: BTreeMap::new(),
        };
    };
    collect_nodes(root, texture_count, 0, &mut records, issues);

    let mut unique_nodes = HashMap::<u64, &NodeRecord>::new();
    for record in &records {
        if let Some(uuid) = record.uuid {
            if let Some(existing) = unique_nodes.insert(uuid, record) {
                issues.push(issue(
                    "node_uuid_duplicate",
                    IssueSeverity::Error,
                    format!(
                        "node UUID {uuid} is shared by {} and {}",
                        node_label(existing),
                        node_label(record)
                    ),
                    None,
                ));
            }
        }
    }
    let by_uuid: HashMap<u64, &NodeRecord> = records
        .iter()
        .filter_map(|record| record.uuid.map(|uuid| (uuid, record)))
        .collect();
    for consumer in &records {
        for source_uuid in &consumer.masks {
            if let Some(source) = by_uuid.get(source_uuid) {
                if source.node_type.as_deref() == Some("Composite") {
                    issues.push(issue(
                        "composite_as_mask_unsupported",
                        IssueSeverity::Error,
                        format!(
                            "Composite node {} is used as a mask source",
                            node_label(source)
                        ),
                        Some(node_label(consumer)),
                    ));
                }
            } else {
                issues.push(issue(
                    "mask_source_missing",
                    IssueSeverity::Error,
                    format!("mask references missing node UUID {source_uuid}"),
                    Some(node_label(consumer)),
                ));
            }
        }
    }

    let mut types = BTreeMap::new();
    for node_type in records
        .iter()
        .filter_map(|record| record.node_type.as_ref())
    {
        *types.entry(node_type.clone()).or_insert(0) += 1;
    }
    NodeSummary {
        count: records.len(),
        types,
    }
}

fn collect_nodes(
    value: &Value,
    texture_count: usize,
    depth: usize,
    records: &mut Vec<NodeRecord>,
    issues: &mut Vec<Issue>,
) {
    if depth > MAX_NODE_DEPTH {
        issues.push(issue(
            "node_depth_unsupported",
            IssueSeverity::Error,
            format!("node tree depth exceeds the limit of {MAX_NODE_DEPTH}"),
            None,
        ));
        return;
    }
    if records.len() >= MAX_NODE_COUNT {
        if !issues
            .iter()
            .any(|item| item.code == "node_count_unsupported")
        {
            issues.push(issue(
                "node_count_unsupported",
                IssueSeverity::Error,
                format!("model contains more than {MAX_NODE_COUNT} nodes"),
                None,
            ));
        }
        return;
    }
    let Some(node) = value.as_object() else {
        issues.push(issue(
            "node_schema_invalid",
            IssueSeverity::Error,
            "a node entry is not an object",
            None,
        ));
        return;
    };
    let mut record = NodeRecord {
        uuid: node.get("uuid").and_then(Value::as_u64),
        name: optional_string(node, "name"),
        node_type: optional_string(node, "type"),
        masks: Vec::new(),
    };
    let label = node_label(&record);
    if let Some(masks) = node.get("masks") {
        if let Some(masks) = masks.as_array() {
            for (index, mask) in masks.iter().enumerate() {
                let Some(source) = mask
                    .as_object()
                    .and_then(|value| value.get("source"))
                    .and_then(Value::as_u64)
                else {
                    issues.push(issue(
                        "mask_schema_invalid",
                        IssueSeverity::Error,
                        format!("mask {index} must be an object with an unsigned integer source"),
                        Some(label.clone()),
                    ));
                    continue;
                };
                record.masks.push(source);
            }
        } else {
            issues.push(issue(
                "mask_schema_invalid",
                IssueSeverity::Error,
                "node.masks must be an array",
                Some(label.clone()),
            ));
        }
    }

    match record.node_type.as_deref() {
        Some("Node" | "Part" | "Composite" | "SimplePhysics" | "MeshGroup" | "Camera") => {}
        Some(other) => issues.push(issue(
            "node_type_unsupported",
            IssueSeverity::Error,
            format!("node type {other:?} is not supported by the browser runtime"),
            Some(label.clone()),
        )),
        None => issues.push(issue(
            "node_schema_invalid",
            IssueSeverity::Error,
            "node has no string type",
            Some(label.clone()),
        )),
    }

    if record.uuid.is_none() {
        issues.push(issue(
            "node_schema_invalid",
            IssueSeverity::Error,
            "node has no unsigned integer UUID",
            Some(label.clone()),
        ));
    }

    if record.node_type.as_deref() == Some("Part") {
        validate_part_textures(node, texture_count, &label, issues);
    }
    if matches!(record.node_type.as_deref(), Some("Part" | "Composite")) {
        validate_blend_mode(node, &label, issues);
    }
    records.push(record);

    if let Some(children) = node.get("children") {
        if let Some(children) = children.as_array() {
            for child in children {
                collect_nodes(child, texture_count, depth + 1, records, issues);
            }
        } else {
            issues.push(issue(
                "node_schema_invalid",
                IssueSeverity::Error,
                "node.children must be an array",
                Some(label),
            ));
        }
    }
}

fn validate_blend_mode(node: &Map<String, Value>, label: &str, issues: &mut Vec<Issue>) {
    let Some(value) = node.get("blend_mode") else {
        return;
    };
    let supported = value
        .as_u64()
        .is_some_and(|mode| SUPPORTED_BLEND_MODE_IDS.contains(&mode))
        || value
            .as_str()
            .is_some_and(|mode| SUPPORTED_BLEND_MODE_NAMES.contains(&mode));
    if !supported {
        issues.push(issue(
            "blend_mode_unsupported",
            IssueSeverity::Error,
            format!("blend mode {value} is not implemented by the WebGL2 renderer"),
            Some(label.to_owned()),
        ));
    }
}

fn validate_part_textures(
    node: &Map<String, Value>,
    texture_count: usize,
    label: &str,
    issues: &mut Vec<Issue>,
) {
    let Some(textures) = node.get("textures").and_then(Value::as_array) else {
        issues.push(issue(
            "part_texture_missing",
            IssueSeverity::Error,
            "Part node has no texture list",
            Some(label.to_owned()),
        ));
        return;
    };
    if textures.is_empty() {
        issues.push(issue(
            "part_texture_missing",
            IssueSeverity::Error,
            "Part node has no albedo texture",
            Some(label.to_owned()),
        ));
        return;
    }

    for (slot, value) in textures.iter().enumerate() {
        let Some(index) = value.as_u64() else {
            issues.push(issue(
                "part_texture_index_invalid",
                IssueSeverity::Error,
                format!("texture slot {slot} is not an unsigned integer"),
                Some(label.to_owned()),
            ));
            continue;
        };
        if slot > 0 && index == u32::MAX as u64 {
            continue;
        }
        if index >= texture_count as u64 {
            issues.push(issue(
                "part_texture_index_invalid",
                IssueSeverity::Error,
                format!("texture slot {slot} references missing texture {index}"),
                Some(label.to_owned()),
            ));
        }
    }
}

fn inspect_publication(metadata: &MetadataReport) -> PublicationReport {
    let mut issues = Vec::new();
    if metadata
        .license_url
        .as_deref()
        .is_none_or(|value| value.trim().is_empty())
    {
        issues.push(issue(
            "license_url_missing",
            IssueSeverity::Warning,
            "the model does not declare a license URL",
            None,
        ));
    }

    match metadata.rights.as_ref().and_then(Value::as_object) {
        Some(rights) => {
            if rights.get("allowed_users").and_then(Value::as_str) != Some("Everyone") {
                issues.push(issue(
                    "allowed_users_require_review",
                    IssueSeverity::Warning,
                    "declared allowed_users is not Everyone",
                    None,
                ));
            }
            if rights.get("allow_redistribution").and_then(Value::as_str) == Some("Prohibited") {
                issues.push(issue(
                    "redistribution_declared_prohibited",
                    IssueSeverity::Error,
                    "model metadata declares redistribution as prohibited",
                    None,
                ));
            }
            if rights.get("require_attribution").and_then(Value::as_bool) == Some(true) {
                issues.push(issue(
                    "attribution_required",
                    IssueSeverity::Warning,
                    "model metadata requires attribution",
                    None,
                ));
            }
        }
        None => issues.push(issue(
            "usage_rights_missing",
            IssueSeverity::Warning,
            "the model does not declare machine-readable usage rights",
            None,
        )),
    }

    PublicationReport {
        requires_confirmation: true,
        issues,
        declared_rights: metadata.rights.clone(),
    }
}

fn empty_metadata() -> MetadataReport {
    MetadataReport {
        name: None,
        version: None,
        rigger: None,
        artist: None,
        copyright: None,
        license_url: None,
        contact: None,
        reference: None,
        rights: None,
    }
}

fn image_format(format: TextureFormat) -> ImageFormat {
    match format {
        TextureFormat::Png => ImageFormat::Png,
        TextureFormat::Tga => ImageFormat::Tga,
        TextureFormat::Bc7 => unreachable!("BC7 is handled before decoding"),
    }
}

fn vec2(value: Option<&Value>) -> Option<[f64; 2]> {
    let values = value?.as_array()?;
    if values.len() != 2 {
        return None;
    }
    Some([values[0].as_f64()?, values[1].as_f64()?])
}

fn push_parameter_vec_issue(issues: &mut Vec<Issue>, name: &str, field: &str) {
    issues.push(issue(
        "parameter_schema_invalid",
        IssueSeverity::Error,
        format!("parameter {name:?} field {field} must contain exactly two numbers"),
        None,
    ));
}

fn optional_string(object: &Map<String, Value>, key: &str) -> Option<String> {
    object.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn has_content(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Array(values) => !values.is_empty(),
        Value::Object(values) => !values.is_empty(),
        Value::String(value) => !value.is_empty(),
        Value::Bool(value) => *value,
        Value::Number(_) => true,
    }
}

fn node_label(node: &NodeRecord) -> String {
    match (&node.name, node.uuid) {
        (Some(name), Some(uuid)) => format!("{name:?} ({uuid})"),
        (Some(name), None) => format!("{name:?}"),
        (None, Some(uuid)) => uuid.to_string(),
        (None, None) => "<unknown>".to_owned(),
    }
}

fn issue(
    code: impl Into<String>,
    severity: IssueSeverity,
    message: impl Into<String>,
    node: Option<String>,
) -> Issue {
    Issue {
        code: code.into(),
        severity,
        message: message.into(),
        node,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::container::TextureEntry;

    fn document(payload: Value, textures: Vec<TextureEntry>) -> InpDocument {
        let payload = serde_json::to_vec(&payload).unwrap();
        InpDocument {
            payload_json: serde_json::from_slice(&payload).unwrap(),
            payload,
            textures,
            extended_section: Vec::new(),
            vendor_count: 0,
        }
    }

    fn payload_with_nodes(nodes: Value) -> Value {
        serde_json::json!({
            "meta": {"version": "1", "licenseURL": "https://example.test/license"},
            "param": [],
            "nodes": nodes
        })
    }

    #[test]
    fn accepts_mesh_group_and_camera_nodes() {
        let payload = payload_with_nodes(serde_json::json!({
            "uuid": 1,
            "name": "root",
            "type": "Node",
            "children": [
                {
                    "uuid": 2,
                    "name": "face",
                    "type": "MeshGroup",
                    "dynamic_deformation": true,
                    "mesh": {"verts": [], "uvs": [], "indices": [], "origin": [0, 0]},
                    "children": []
                },
                {
                    "uuid": 3,
                    "name": "Default Camera",
                    "type": "Camera",
                    "viewport": [0, 0, 1280, 720],
                    "children": []
                }
            ]
        }));
        let document = document(payload, Vec::new());
        let report = inspect(&[], &document).unwrap();
        assert!(report.compatibility.supported);
        assert_eq!(report.nodes.types.get("MeshGroup"), Some(&1));
        assert_eq!(report.nodes.types.get("Camera"), Some(&1));
    }

    #[test]
    fn rejects_composite_used_as_mask() {
        let payload = payload_with_nodes(serde_json::json!({
            "uuid": 1,
            "name": "root",
            "type": "Node",
            "children": [
                {"uuid": 2, "name": "mask", "type": "Composite", "children": []},
                {"uuid": 3, "name": "consumer", "type": "Node", "masks": [{"source": 2, "mode": "Mask"}], "children": []}
            ]
        }));
        let document = document(payload, Vec::new());
        let report = inspect(&[], &document).unwrap();
        assert!(report
            .compatibility
            .issues
            .iter()
            .any(|item| item.code == "composite_as_mask_unsupported"));
    }

    #[test]
    fn rejects_duplicate_node_uuids_and_malformed_masks() {
        let payload = payload_with_nodes(serde_json::json!({
            "uuid": 1,
            "name": "root",
            "type": "Node",
            "children": [
                {"uuid": 2, "name": "first", "type": "Node", "children": []},
                {
                    "uuid": 2,
                    "name": "second",
                    "type": "Node",
                    "masks": [{"mode": "Mask"}, 3],
                    "children": []
                }
            ]
        }));
        let report = inspect(&[], &document(payload, Vec::new())).unwrap();
        assert!(!report.compatibility.supported);
        assert!(report
            .compatibility
            .issues
            .iter()
            .any(|item| item.code == "node_uuid_duplicate"));
        assert_eq!(
            report
                .compatibility
                .issues
                .iter()
                .filter(|item| item.code == "mask_schema_invalid")
                .count(),
            2
        );
    }

    #[test]
    fn rejects_one_parameter_uuid_shared_by_different_names() {
        let parameter = |name: &str| {
            serde_json::json!({
                "uuid": 42,
                "name": name,
                "is_vec2": false,
                "min": [-1, 0],
                "max": [1, 1],
                "defaults": [0, 0],
                "axis_points": [[0, 1], [0]],
                "bindings": []
            })
        };
        let payload = serde_json::json!({
            "meta": {"version": "1", "licenseURL": "https://example.test/license"},
            "param": [parameter("HeadX"), parameter("BodyX")],
            "nodes": {"uuid": 1, "name": "root", "type": "Node", "children": []}
        });
        let report = inspect(&[], &document(payload, Vec::new())).unwrap();
        assert!(!report.compatibility.supported);
        assert!(report
            .compatibility
            .issues
            .iter()
            .any(|item| item.code == "parameter_uuid_duplicate"));
    }

    #[test]
    fn distinguishes_publication_review_from_runtime_compatibility() {
        let payload = serde_json::json!({
            "meta": {"version": "1", "licenseURL": null},
            "param": [],
            "nodes": {"uuid": 1, "name": "root", "type": "Node", "children": []}
        });
        let document = document(payload, Vec::new());
        let report = inspect(&[], &document).unwrap();
        assert!(report.compatibility.supported);
        assert!(report.publication.requires_confirmation);
        assert!(report
            .publication
            .issues
            .iter()
            .any(|item| item.code == "license_url_missing"));
    }

    #[test]
    fn rejects_blend_modes_not_implemented_by_the_web_renderer() {
        let payload = payload_with_nodes(serde_json::json!({
            "uuid": 1,
            "name": "unsupported overlay",
            "type": "Composite",
            "blend_mode": 3,
            "children": []
        }));
        let document = document(payload, Vec::new());
        let report = inspect(&[], &document).unwrap();
        assert!(!report.compatibility.supported);
        assert!(report
            .compatibility
            .issues
            .iter()
            .any(|item| item.code == "blend_mode_unsupported"));
    }

    #[test]
    fn accepts_color_burn_blend_mode() {
        let payload = payload_with_nodes(serde_json::json!({
            "uuid": 1,
            "name": "shadow",
            "type": "Composite",
            "blend_mode": "ColorBurn",
            "children": []
        }));
        let report = inspect(&[], &document(payload, Vec::new())).unwrap();
        assert!(report.compatibility.supported);
    }

    #[test]
    fn rejects_excessive_node_depth_without_recursing_unboundedly() {
        let mut node =
            serde_json::json!({"uuid": 200, "name": "leaf", "type": "Node", "children": []});
        for uuid in (1..=MAX_NODE_DEPTH + 2).rev() {
            node = serde_json::json!({
                "uuid": uuid,
                "name": "nested",
                "type": "Node",
                "children": [node]
            });
        }
        let document = document(payload_with_nodes(node), Vec::new());
        let report = inspect(&[], &document).unwrap();
        assert!(report
            .compatibility
            .issues
            .iter()
            .any(|item| item.code == "node_depth_unsupported"));
    }

    #[test]
    fn accepts_cubic_binding_interpolation() {
        let payload = serde_json::json!({
            "meta": {"version": "1", "licenseURL": "https://example.test/license"},
            "param": [{
                "name": "HeadX",
                "is_vec2": false,
                "min": [-1, 0],
                "max": [1, 1],
                "defaults": [0, 0],
                "axis_points": [[0, 0.5, 1], [0]],
                "bindings": [{
                    "param_name": "transform.r.z",
                    "node": 1,
                    "interpolate_mode": "Cubic",
                    "values": [[0], [0], [0]]
                }]
            }],
            "nodes": {"uuid": 1, "name": "root", "type": "Node", "children": []}
        });
        let report = inspect(&[], &document(payload, Vec::new())).unwrap();
        assert!(report.compatibility.supported);
    }

    #[test]
    fn rejects_quadratic_binding_interpolation() {
        let payload = serde_json::json!({
            "meta": {"version": "1", "licenseURL": "https://example.test/license"},
            "param": [{
                "name": "HeadX",
                "is_vec2": false,
                "min": [-1, 0],
                "max": [1, 1],
                "defaults": [0, 0],
                "axis_points": [[0, 0.5, 1], [0]],
                "bindings": [{
                    "param_name": "transform.r.z",
                    "node": 1,
                    "interpolate_mode": "Quadratic",
                    "values": [[0], [0], [0]]
                }]
            }],
            "nodes": {"uuid": 1, "name": "root", "type": "Node", "children": []}
        });
        let report = inspect(&[], &document(payload, Vec::new())).unwrap();
        assert!(!report.compatibility.supported);
        assert!(report
            .compatibility
            .issues
            .iter()
            .any(|item| item.code == "binding_interpolation_unsupported"));
    }

    #[test]
    fn rejects_malformed_parameter_axis_layout() {
        let payload = serde_json::json!({
            "meta": {"version": "1", "licenseURL": "https://example.test/license"},
            "param": [{
                "name": "HeadXY",
                "is_vec2": true,
                "min": [-1, -1],
                "max": [1, 1],
                "defaults": [0, 0],
                "axis_points": [[0, 0.5, 0.5], [0, 1]],
                "bindings": []
            }],
            "nodes": {"uuid": 1, "name": "root", "type": "Node", "children": []}
        });
        let report = inspect(&[], &document(payload, Vec::new())).unwrap();
        assert!(!report.compatibility.supported);
        assert!(report
            .compatibility
            .issues
            .iter()
            .any(|item| item.code == "parameter_axis_points_invalid"));
    }

    #[test]
    fn extracts_a_strict_creator_animation_for_browser_playback() {
        let payload = serde_json::json!({
            "meta": {"version": "1", "licenseURL": "https://example.test/license"},
            "param": [{
                "uuid": 42,
                "name": "Arm:: Right:: Move",
                "is_vec2": false,
                "min": [0, 0],
                "max": [1, 1],
                "defaults": [0, 0],
                "axis_points": [[0, 1], [0]],
                "bindings": []
            }],
            "animations": {
                "Click": {
                    "timestep": 0.03333333333333333,
                    "additive": false,
                    "length": 30,
                    "leadIn": 5,
                    "leadOut": 25,
                    "animationWeight": 1,
                    "lanes": [{
                        "interpolation": "Cubic",
                        "uuid": 42,
                        "target": 0,
                        "keyframes": [
                            {"value": 0, "frame": 0, "tension": 0.5},
                            {"value": 1, "frame": 10, "tension": 0.5},
                            {"value": 0, "frame": 30, "tension": 0.5}
                        ],
                        "merge_mode": "Forced"
                    }]
                }
            },
            "nodes": {"uuid": 1, "name": "root", "type": "Node", "children": []}
        });
        let report = inspect(&[], &document(payload, Vec::new())).unwrap();

        assert!(report.compatibility.supported);
        assert_eq!(report.animations.len(), 1);
        assert_eq!(report.animations[0].name, "Click");
        assert_eq!(report.animations[0].timestep_ms, 1000.0 / 30.0);
        assert_eq!(report.animations[0].lead_in, 5);
        assert_eq!(report.animations[0].lead_out, 25);
        assert_eq!(
            report.animations[0].lanes[0].parameter,
            "Arm:: Right:: Move"
        );
        assert_eq!(
            report.animations[0].lanes[0].interpolation,
            AnimationInterpolation::Cubic
        );
    }

    #[test]
    fn rejects_animation_lanes_that_reference_unknown_parameters() {
        let payload = serde_json::json!({
            "meta": {"version": "1", "licenseURL": "https://example.test/license"},
            "param": [],
            "animations": {
                "Click": {
                    "timestep": 0.04,
                    "additive": false,
                    "length": 10,
                    "leadIn": 0,
                    "leadOut": 8,
                    "animationWeight": 1,
                    "lanes": [{
                        "interpolation": "Linear",
                        "uuid": 999,
                        "target": 0,
                        "keyframes": [
                            {"value": 0, "frame": 0, "tension": 0},
                            {"value": 1, "frame": 10, "tension": 0}
                        ],
                        "merge_mode": "Forced"
                    }]
                }
            },
            "nodes": {"uuid": 1, "name": "root", "type": "Node", "children": []}
        });
        let report = inspect(&[], &document(payload, Vec::new())).unwrap();

        assert!(!report.compatibility.supported);
        assert!(report
            .compatibility
            .issues
            .iter()
            .any(|item| item.code == "animation_parameter_unknown"));
        assert!(report.animations.is_empty());
    }
}
