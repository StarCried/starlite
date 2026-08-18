use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ImageEncoder, ImageFormat, ImageReader, Limits};
use serde_json::Value;

use crate::container::{self, InpDocument, TextureEntry};
use crate::inspect;
use crate::model::{
    BuildManifest, Issue, IssueSeverity, ModelArtifact, OptimizationReport, PublishedArtifact,
    TextureArtifact, TextureFormat, MANIFEST_SCHEMA_VERSION,
};
use crate::{read_limited_file, sha256_hex, PipelineError, Result, MAX_INPUT_BYTES};

const MODEL_SIZE_BUDGET: u64 = 8 * 1024 * 1024;
const FALLBACK_SIZE_BUDGET: u64 = 8 * 1024 * 1024;
const MAX_TEXTURE_DIMENSION: u32 = 4096;
const MAX_SOURCE_TEXTURE_DIMENSION: u32 = 8192;
const MAX_SOURCE_TEXTURE_DECODE_ALLOC: u64 = 192 * 1024 * 1024;
const MAX_OUTPUT_TEXTURE_DECODE_ALLOC: u64 = 128 * 1024 * 1024;
const MAX_ADAPTIVE_RESIZE_PASSES: usize = 4;
const ADAPTIVE_RESIZE_SAFETY_FACTOR: f64 = 0.9;
const HASH_PREFIX_LENGTH: usize = 12;

#[derive(Clone, Debug)]
pub struct BuildRequest {
    pub input: PathBuf,
    pub output_dir: PathBuf,
    pub fallback: Option<PathBuf>,
}

#[derive(Clone, Debug)]
struct PreparedBuild {
    model_bytes: Vec<u8>,
    fallback: Option<PreparedFallback>,
    manifest: BuildManifest,
}

#[derive(Clone, Debug)]
struct PreparedFallback {
    bytes: Vec<u8>,
    artifact: PublishedArtifact,
}

pub fn build(request: &BuildRequest) -> Result<BuildManifest> {
    if request.output_dir.exists() {
        return Err(PipelineError::OutputExists(request.output_dir.clone()));
    }

    let source_bytes = read_limited_file(&request.input, "model", MAX_INPUT_BYTES)?;
    let document = container::parse(&source_bytes)?;
    let fallback = request
        .fallback
        .as_deref()
        .map(prepare_fallback)
        .transpose()?;
    let prepared = prepare(&source_bytes, document, fallback)?;
    write_transactionally(&request.output_dir, &prepared)?;
    Ok(prepared.manifest)
}

fn prepare(
    source_bytes: &[u8],
    mut document: InpDocument,
    fallback: Option<PreparedFallback>,
) -> Result<PreparedBuild> {
    let mut inspection = inspect::inspect(source_bytes, &document)?;
    if !inspection.compatibility.supported {
        let errors = inspection
            .compatibility
            .issues
            .iter()
            .filter(|issue| issue.severity == IssueSeverity::Error)
            .map(|issue| issue.code.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        return Err(PipelineError::UnsupportedModel(errors));
    }
    let alias_issues = inspection
        .compatibility
        .issues
        .iter()
        .filter(|issue| issue.code == "parameter_alias_merged")
        .cloned()
        .collect::<Vec<_>>();
    if merge_parameter_aliases(&mut document)? > 0 {
        inspection = inspect::inspect(source_bytes, &document)?;
        inspection.compatibility.issues.extend(alias_issues);
    }

    let mut texture_artifacts = Vec::with_capacity(document.textures.len());
    let source_texture_bytes = document
        .textures
        .iter()
        .map(|texture| texture.data.len() as u64)
        .sum();

    for (index, texture) in document.textures.iter_mut().enumerate() {
        let source_format = texture.format;
        let source_length = texture.data.len() as u64;
        let decoded = decode_texture(index, texture)?;
        let (source_width, source_height) = (decoded.width(), decoded.height());
        let resized = source_width > MAX_TEXTURE_DIMENSION || source_height > MAX_TEXTURE_DIMENSION;
        let prepared_image = if resized {
            decoded.resize(
                MAX_TEXTURE_DIMENSION,
                MAX_TEXTURE_DIMENSION,
                image::imageops::FilterType::Lanczos3,
            )
        } else {
            decoded
        };
        let (width, height) = (prepared_image.width(), prepared_image.height());

        let png = encode_png(index, &prepared_image)?;
        if resized {
            texture.format = TextureFormat::Png;
            texture.data = png;
        } else {
            match source_format {
                TextureFormat::Tga => {
                    if png.len() < texture.data.len() {
                        texture.format = TextureFormat::Png;
                        texture.data = png;
                    }
                }
                TextureFormat::Png => {
                    if png.len() < texture.data.len() {
                        texture.data = png;
                    }
                }
                TextureFormat::Bc7 => unreachable!("BC7 is rejected during texture decoding"),
            }
        }

        texture_artifacts.push(TextureArtifact {
            index,
            source_format,
            output_format: texture.format,
            source_width,
            source_height,
            width,
            height,
            source_bytes: source_length,
            output_bytes: texture.data.len() as u64,
            sha256: sha256_hex(&texture.data),
        });
    }

    let mut model_bytes = container::encode(&document)?;
    let mut adaptive_resize_passes = 0;
    while model_bytes.len() as u64 > MODEL_SIZE_BUDGET
        && adaptive_resize_passes < MAX_ADAPTIVE_RESIZE_PASSES
    {
        let texture_bytes = document
            .textures
            .iter()
            .map(|texture| texture.data.len() as u64)
            .sum::<u64>();
        let fixed_bytes = (model_bytes.len() as u64).saturating_sub(texture_bytes);
        if fixed_bytes >= MODEL_SIZE_BUDGET {
            return Err(PipelineError::UnsupportedModel(format!(
                "model_payload_over_size_budget: non-texture data is {fixed_bytes} bytes; \
                 the complete model limit is {MODEL_SIZE_BUDGET}"
            )));
        }
        let available_texture_bytes = MODEL_SIZE_BUDGET - fixed_bytes;
        let scale = ((available_texture_bytes as f64 / texture_bytes.max(1) as f64).sqrt()
            * ADAPTIVE_RESIZE_SAFETY_FACTOR)
            .clamp(0.05, 0.9);
        if !resize_all_textures(&mut document, &mut texture_artifacts, scale)? {
            break;
        }
        adaptive_resize_passes += 1;
        model_bytes = container::encode(&document)?;
    }

    container::parse(&model_bytes)
        .map_err(|error| PipelineError::RuntimeValidation(error.to_string()))?;
    if model_bytes.len() as u64 > MODEL_SIZE_BUDGET {
        return Err(PipelineError::UnsupportedModel(format!(
            "optimized_model_over_size_budget: model is {} bytes; limit is {MODEL_SIZE_BUDGET}",
            model_bytes.len()
        )));
    }

    let model_hash = sha256_hex(&model_bytes);
    let model_file = format!("model.{}.inp", hash_prefix(&model_hash));
    let output_texture_bytes = document
        .textures
        .iter()
        .map(|texture| texture.data.len() as u64)
        .sum();
    let resized_textures = texture_artifacts
        .iter()
        .filter(|texture| {
            texture.source_width != texture.width || texture.source_height != texture.height
        })
        .count();
    let converted_tga_to_png = texture_artifacts
        .iter()
        .filter(|texture| {
            texture.source_format == TextureFormat::Tga
                && texture.output_format == TextureFormat::Png
        })
        .count();
    let retained_tga = texture_artifacts
        .iter()
        .filter(|texture| {
            texture.source_format == TextureFormat::Tga
                && texture.output_format == TextureFormat::Tga
        })
        .count();
    let recompressed_png = texture_artifacts
        .iter()
        .filter(|texture| {
            texture.source_format == TextureFormat::Png
                && texture.output_format == TextureFormat::Png
                && texture.source_width == texture.width
                && texture.source_height == texture.height
                && texture.output_bytes < texture.source_bytes
        })
        .count();
    let total_bytes_saved = (source_bytes.len() as u64).saturating_sub(model_bytes.len() as u64);
    let output_to_source_ratio = if source_bytes.is_empty() {
        1.0
    } else {
        model_bytes.len() as f64 / source_bytes.len() as f64
    };

    let mut compatibility = inspection.compatibility.clone();
    compatibility.issues.retain(|issue| {
        issue.code != "source_model_over_size_budget" && issue.code != "texture_resize_required"
    });
    for texture in texture_artifacts.iter().filter(|texture| {
        texture.source_width != texture.width || texture.source_height != texture.height
    }) {
        compatibility.issues.push(Issue {
            code: "texture_resized_for_web".to_owned(),
            severity: IssueSeverity::Warning,
            message: format!(
                "texture {} was resized from {}x{} to {}x{} with Lanczos3 filtering",
                texture.index,
                texture.source_width,
                texture.source_height,
                texture.width,
                texture.height
            ),
            node: None,
        });
    }
    let manifest = BuildManifest {
        schema_version: MANIFEST_SCHEMA_VERSION,
        tool: "inochi2d-pipeline".to_owned(),
        tool_version: env!("CARGO_PKG_VERSION").to_owned(),
        model: ModelArtifact {
            file: model_file,
            sha256: model_hash,
            bytes: model_bytes.len() as u64,
            source_sha256: inspection.source.sha256,
            source_bytes: inspection.source.bytes,
        },
        fallback: fallback.as_ref().map(|item| item.artifact.clone()),
        payload_bytes: inspection.payload_bytes,
        vendor_count: inspection.vendor_count,
        metadata: inspection.metadata,
        parameters: inspection.parameters,
        animations: inspection.animations,
        nodes: inspection.nodes,
        textures: texture_artifacts,
        compatibility,
        publication: inspection.publication,
        optimization: OptimizationReport {
            lossless: resized_textures == 0,
            resized_textures,
            adaptive_resize_passes,
            converted_tga_to_png,
            retained_tga,
            recompressed_png,
            source_texture_bytes,
            output_texture_bytes,
            total_bytes_saved,
            output_to_source_ratio,
        },
    };

    Ok(PreparedBuild {
        model_bytes,
        fallback,
        manifest,
    })
}

fn merge_parameter_aliases(document: &mut InpDocument) -> Result<usize> {
    let payload = document.payload_json.as_object_mut().ok_or_else(|| {
        PipelineError::InvalidContainer("the JSON payload root must be an object".to_owned())
    })?;
    let parameters = payload
        .get_mut("param")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| {
            PipelineError::InvalidContainer("payload.param must be an array".to_owned())
        })?;

    let mut merged = Vec::<Value>::with_capacity(parameters.len());
    let mut indices = HashMap::<(String, u64), usize>::new();
    let mut merged_count = 0;
    for parameter in parameters.drain(..) {
        let object = parameter.as_object().ok_or_else(|| {
            PipelineError::InvalidContainer("a parameter entry is not an object".to_owned())
        })?;
        let name = object
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                PipelineError::InvalidContainer("a parameter entry has no name".to_owned())
            })?
            .to_owned();
        let Some(uuid) = object.get("uuid").and_then(Value::as_u64) else {
            merged.push(parameter);
            continue;
        };
        let key = (name.clone(), uuid);
        let Some(existing_index) = indices.get(&key).copied() else {
            indices.insert(key, merged.len());
            merged.push(parameter);
            continue;
        };

        let existing = merged[existing_index]
            .as_object_mut()
            .expect("only parameter objects are inserted");
        let mut existing_signature = existing.clone();
        let mut incoming_signature = object.clone();
        existing_signature.remove("bindings");
        incoming_signature.remove("bindings");
        if existing_signature != incoming_signature {
            return Err(PipelineError::UnsupportedModel(format!(
                "parameter_alias_conflict: parameter {name:?} shares UUID {uuid} but has incompatible metadata"
            )));
        }

        let incoming_bindings = object
            .get("bindings")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                PipelineError::InvalidContainer(format!(
                    "parameter {name:?} bindings must be an array"
                ))
            })?;
        let existing_bindings = existing
            .get_mut("bindings")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| {
                PipelineError::InvalidContainer(format!(
                    "parameter {name:?} bindings must be an array"
                ))
            })?;
        existing_bindings.extend(incoming_bindings.iter().cloned());
        merged_count += 1;
    }
    *parameters = merged;
    if merged_count > 0 {
        document.payload = serde_json::to_vec(&document.payload_json)?;
    }
    Ok(merged_count)
}

fn decode_texture(index: usize, texture: &TextureEntry) -> Result<DynamicImage> {
    let format = match texture.format {
        TextureFormat::Png => ImageFormat::Png,
        TextureFormat::Tga => ImageFormat::Tga,
        TextureFormat::Bc7 => {
            return Err(PipelineError::UnsupportedModel(
                "bc7_texture_unsupported".to_owned(),
            ));
        }
    };
    decode_bounded(
        &texture.data,
        format,
        MAX_SOURCE_TEXTURE_DIMENSION,
        MAX_SOURCE_TEXTURE_DECODE_ALLOC,
    )
    .map_err(|source| PipelineError::TextureDecode {
        index,
        format: texture.format.label(),
        source,
    })
}

fn encode_png(index: usize, image: &DynamicImage) -> Result<Vec<u8>> {
    let mut output = Vec::new();
    PngEncoder::new_with_quality(&mut output, CompressionType::Best, FilterType::Adaptive)
        .write_image(
            image.as_bytes(),
            image.width(),
            image.height(),
            image.color().into(),
        )
        .map_err(|source| PipelineError::TextureEncode { index, source })?;
    Ok(output)
}

fn resize_all_textures(
    document: &mut InpDocument,
    artifacts: &mut [TextureArtifact],
    scale: f64,
) -> Result<bool> {
    let mut changed = false;
    for (index, texture) in document.textures.iter_mut().enumerate() {
        let decoded = decode_texture(index, texture)?;
        let width = ((f64::from(decoded.width()) * scale).floor() as u32).max(1);
        let height = ((f64::from(decoded.height()) * scale).floor() as u32).max(1);
        if width == decoded.width() && height == decoded.height() {
            continue;
        }

        let resized = decoded.resize_exact(width, height, image::imageops::FilterType::Lanczos3);
        texture.format = TextureFormat::Png;
        texture.data = encode_png(index, &resized)?;
        let artifact = artifacts.get_mut(index).ok_or_else(|| {
            PipelineError::RuntimeValidation(format!(
                "texture artifact {index} disappeared during adaptive resize"
            ))
        })?;
        artifact.output_format = TextureFormat::Png;
        artifact.width = width;
        artifact.height = height;
        artifact.output_bytes = texture.data.len() as u64;
        artifact.sha256 = sha256_hex(&texture.data);
        changed = true;
    }
    Ok(changed)
}

fn prepare_fallback(path: &Path) -> Result<PreparedFallback> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| {
            PipelineError::InvalidArgument("fallback image must have a file extension".to_owned())
        })?;
    if extension != "png" {
        return Err(PipelineError::InvalidArgument(format!(
            "unsupported fallback extension {extension:?}; version 0.1 accepts PNG only"
        )));
    }

    let bytes = read_limited_file(path, "fallback", FALLBACK_SIZE_BUDGET)?;
    decode_bounded(
        &bytes,
        ImageFormat::Png,
        MAX_TEXTURE_DIMENSION,
        MAX_OUTPUT_TEXTURE_DECODE_ALLOC,
    )
    .map_err(|source| PipelineError::TextureDecode {
        index: usize::MAX,
        format: "fallback PNG",
        source,
    })?;
    let hash = sha256_hex(&bytes);
    let artifact = PublishedArtifact {
        file: format!("fallback.{}.{}", hash_prefix(&hash), extension),
        sha256: hash,
        bytes: bytes.len() as u64,
    };
    Ok(PreparedFallback { bytes, artifact })
}

fn decode_bounded(
    bytes: &[u8],
    format: ImageFormat,
    maximum_dimension: u32,
    maximum_allocation: u64,
) -> image::ImageResult<DynamicImage> {
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(maximum_dimension);
    limits.max_image_height = Some(maximum_dimension);
    limits.max_alloc = Some(maximum_allocation);
    reader.limits(limits);
    reader.decode()
}

fn write_transactionally(output_dir: &Path, prepared: &PreparedBuild) -> Result<()> {
    let parent = output_dir.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let output_name = output_dir
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            PipelineError::InvalidArgument(
                "output directory must have a valid final component".to_owned(),
            )
        })?;
    let staging_path = parent.join(format!(".{output_name}.tmp-{}", std::process::id()));
    let mut staging = StagingDirectory::create(staging_path)?;

    write_new(
        &staging.path.join(&prepared.manifest.model.file),
        &prepared.model_bytes,
    )?;
    if let Some(fallback) = &prepared.fallback {
        write_new(&staging.path.join(&fallback.artifact.file), &fallback.bytes)?;
    }
    let mut manifest_bytes = serde_json::to_vec_pretty(&prepared.manifest)?;
    manifest_bytes.push(b'\n');
    write_new(&staging.path.join("manifest.json"), &manifest_bytes)?;

    fs::rename(&staging.path, output_dir)?;
    staging.committed = true;
    Ok(())
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn hash_prefix(hash: &str) -> &str {
    &hash[..HASH_PREFIX_LENGTH]
}

struct StagingDirectory {
    path: PathBuf,
    committed: bool,
}

impl StagingDirectory {
    fn create(path: PathBuf) -> Result<Self> {
        fs::create_dir(&path)?;
        Ok(Self {
            path,
            committed: false,
        })
    }
}

impl Drop for StagingDirectory {
    fn drop(&mut self) {
        if !self.committed {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn fixture_document(texture: Option<TextureEntry>) -> (Vec<u8>, InpDocument) {
        let payload = include_bytes!("../../../fixtures/synthetic-puppet.json").to_vec();
        let document = InpDocument {
            payload_json: serde_json::from_slice(&payload).unwrap(),
            payload,
            textures: texture.into_iter().collect(),
            extended_section: Vec::new(),
            vendor_count: 0,
        };
        let bytes = container::encode(&document).unwrap();
        (bytes, document)
    }

    fn solid_tga(width: u16, height: u16) -> Vec<u8> {
        let mut bytes = vec![0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        bytes.extend_from_slice(&width.to_le_bytes());
        bytes.extend_from_slice(&height.to_le_bytes());
        bytes.extend_from_slice(&[24, 0x20]);
        for _ in 0..u32::from(width) * u32::from(height) {
            bytes.extend_from_slice(&[30, 20, 10]);
        }
        bytes
    }

    fn solid_png(width: u32, height: u32, compression: CompressionType) -> Vec<u8> {
        let mut pixels = Vec::with_capacity((width * height * 4) as usize);
        for _ in 0..width * height {
            pixels.extend_from_slice(&[10, 20, 30, 255]);
        }
        let mut bytes = Vec::new();
        PngEncoder::new_with_quality(&mut bytes, compression, FilterType::Adaptive)
            .write_image(&pixels, width, height, image::ExtendedColorType::Rgba8)
            .unwrap();
        bytes
    }

    fn temp_path(label: &str) -> PathBuf {
        let id = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "inochi2d-pipeline-{label}-{}-{id}",
            std::process::id()
        ))
    }

    #[test]
    fn converts_large_uncompressed_tga_to_smaller_png_losslessly() {
        let tga = solid_tga(64, 64);
        let original_pixels = image::load_from_memory_with_format(&tga, ImageFormat::Tga)
            .unwrap()
            .to_rgba8();
        let (source, document) = fixture_document(Some(TextureEntry {
            format: TextureFormat::Tga,
            data: tga,
        }));
        let prepared = prepare(&source, document, None).unwrap();
        let output = container::parse(&prepared.model_bytes).unwrap();

        assert_eq!(output.textures[0].format, TextureFormat::Png);
        let optimized_pixels =
            image::load_from_memory_with_format(&output.textures[0].data, ImageFormat::Png)
                .unwrap()
                .to_rgba8();
        assert_eq!(optimized_pixels, original_pixels);
        assert_eq!(prepared.manifest.optimization.converted_tga_to_png, 1);
        assert!(prepared.manifest.optimization.total_bytes_saved > 0);
    }

    #[test]
    fn recompresses_existing_png_only_when_smaller_and_keeps_pixels() {
        let png = solid_png(64, 64, CompressionType::Fast);
        let input_length = png.len();
        let original_pixels = image::load_from_memory_with_format(&png, ImageFormat::Png)
            .unwrap()
            .to_rgba8();
        let (source, document) = fixture_document(Some(TextureEntry {
            format: TextureFormat::Png,
            data: png,
        }));
        let prepared = prepare(&source, document, None).unwrap();
        let output = container::parse(&prepared.model_bytes).unwrap();

        assert_eq!(output.textures[0].format, TextureFormat::Png);
        assert!(output.textures[0].data.len() < input_length);
        let optimized_pixels =
            image::load_from_memory_with_format(&output.textures[0].data, ImageFormat::Png)
                .unwrap()
                .to_rgba8();
        assert_eq!(optimized_pixels, original_pixels);
        assert_eq!(prepared.manifest.optimization.recompressed_png, 1);
    }

    #[test]
    fn resizes_oversized_textures_deterministically_and_reports_loss() {
        let png = solid_png(4097, 2, CompressionType::Fast);
        let (source, document) = fixture_document(Some(TextureEntry {
            format: TextureFormat::Png,
            data: png,
        }));
        let prepared = prepare(&source, document, None).unwrap();
        let output = container::parse(&prepared.model_bytes).unwrap();
        let resized =
            image::load_from_memory_with_format(&output.textures[0].data, ImageFormat::Png)
                .unwrap();

        assert_eq!((resized.width(), resized.height()), (4096, 2));
        assert!(!prepared.manifest.optimization.lossless);
        assert_eq!(prepared.manifest.optimization.resized_textures, 1);
        assert_eq!(prepared.manifest.textures[0].source_width, 4097);
        assert_eq!(prepared.manifest.textures[0].source_height, 2);
        assert_eq!(prepared.manifest.textures[0].width, 4096);
        assert_eq!(prepared.manifest.textures[0].height, 2);
        assert!(prepared
            .manifest
            .compatibility
            .issues
            .iter()
            .any(|issue| issue.code == "texture_resized_for_web"));
    }

    #[test]
    fn rejects_source_textures_beyond_the_preprocessing_bound() {
        let png = solid_png(8193, 1, CompressionType::Fast);
        let (source, document) = fixture_document(Some(TextureEntry {
            format: TextureFormat::Png,
            data: png,
        }));
        let error = prepare(&source, document, None).unwrap_err().to_string();
        assert!(
            error.contains("texture_source_dimension_unsupported"),
            "{error}"
        );
    }

    #[test]
    fn preparation_is_deterministic() {
        let texture = TextureEntry {
            format: TextureFormat::Tga,
            data: solid_tga(64, 64),
        };
        let (source_a, document_a) = fixture_document(Some(texture.clone()));
        let (source_b, document_b) = fixture_document(Some(texture));
        let first = prepare(&source_a, document_a, None).unwrap();
        let second = prepare(&source_b, document_b, None).unwrap();
        assert_eq!(first.model_bytes, second.model_bytes);
        assert_eq!(first.manifest, second.manifest);
    }

    #[test]
    fn merges_split_parameter_bindings_with_the_same_name_and_uuid() {
        let payload = serde_json::json!({
            "meta": {"version": "v0.8.6"},
            "param": [
                {
                    "uuid": 42,
                    "name": "Physics - Arm",
                    "is_vec2": false,
                    "min": [-1, 0],
                    "max": [1, 1],
                    "defaults": [0, 0],
                    "axis_points": [[0, 1], [0]],
                    "bindings": [{"param_name": "transform.r.z", "node": 1}]
                },
                {
                    "uuid": 42,
                    "name": "Physics - Arm",
                    "is_vec2": false,
                    "min": [-1, 0],
                    "max": [1, 1],
                    "defaults": [0, 0],
                    "axis_points": [[0, 1], [0]],
                    "bindings": [{"param_name": "deform", "node": 2}]
                }
            ],
            "nodes": {"uuid": 1, "name": "Root", "type": "Node", "children": []}
        });
        let encoded = serde_json::to_vec(&payload).unwrap();
        let mut document = InpDocument {
            payload: encoded.clone(),
            payload_json: serde_json::from_slice(&encoded).unwrap(),
            textures: Vec::new(),
            extended_section: Vec::new(),
            vendor_count: 0,
        };

        assert_eq!(merge_parameter_aliases(&mut document).unwrap(), 1);
        let parameters = document.payload_json["param"].as_array().unwrap();
        assert_eq!(parameters.len(), 1);
        assert_eq!(parameters[0]["bindings"].as_array().unwrap().len(), 2);
        assert_eq!(
            serde_json::from_slice::<Value>(&document.payload).unwrap(),
            document.payload_json
        );
    }

    #[test]
    fn rejects_bc7_before_writing_output() {
        let (source, document) = fixture_document(Some(TextureEntry {
            format: TextureFormat::Bc7,
            data: vec![0; 16],
        }));
        let error = prepare(&source, document, None).unwrap_err().to_string();
        assert!(error.contains("bc7_texture_unsupported"), "{error}");
    }

    #[test]
    fn refuses_to_replace_existing_output_directory() {
        let path = temp_path("existing");
        fs::create_dir(&path).unwrap();
        let request = BuildRequest {
            input: path.join("missing.inp"),
            output_dir: path.clone(),
            fallback: None,
        };
        let error = build(&request).unwrap_err().to_string();
        assert!(error.contains("already exists"), "{error}");
        fs::remove_dir(&path).unwrap();
    }
}
