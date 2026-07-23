use std::fs::{self, OpenOptions};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{DynamicImage, ImageEncoder, ImageFormat, ImageReader, Limits};

use crate::container::{self, InpDocument, TextureEntry};
use crate::inspect;
use crate::model::{
    BuildManifest, IssueSeverity, ModelArtifact, OptimizationReport, PublishedArtifact,
    TextureArtifact, TextureFormat, MANIFEST_SCHEMA_VERSION,
};
use crate::{read_limited_file, sha256_hex, PipelineError, Result, MAX_INPUT_BYTES};

const MODEL_SIZE_BUDGET: u64 = 8 * 1024 * 1024;
const FALLBACK_SIZE_BUDGET: u64 = 8 * 1024 * 1024;
const MAX_TEXTURE_DIMENSION: u32 = 4096;
const MAX_TEXTURE_DECODE_ALLOC: u64 = 128 * 1024 * 1024;
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
    let inspection = inspect::inspect(source_bytes, &document)?;
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

    let mut texture_artifacts = Vec::with_capacity(document.textures.len());
    let mut converted_tga_to_png = 0;
    let mut retained_tga = 0;
    let mut recompressed_png = 0;
    let source_texture_bytes = document
        .textures
        .iter()
        .map(|texture| texture.data.len() as u64)
        .sum();

    for (index, texture) in document.textures.iter_mut().enumerate() {
        let source_format = texture.format;
        let source_length = texture.data.len() as u64;
        let decoded = decode_texture(index, texture)?;
        let (width, height) = (decoded.width(), decoded.height());

        let png = encode_png(index, &decoded)?;
        match source_format {
            TextureFormat::Tga => {
                if png.len() < texture.data.len() {
                    texture.format = TextureFormat::Png;
                    texture.data = png;
                    converted_tga_to_png += 1;
                } else {
                    retained_tga += 1;
                }
            }
            TextureFormat::Png => {
                if png.len() < texture.data.len() {
                    texture.data = png;
                    recompressed_png += 1;
                }
            }
            TextureFormat::Bc7 => unreachable!("BC7 is rejected during texture decoding"),
        }

        texture_artifacts.push(TextureArtifact {
            index,
            source_format,
            output_format: texture.format,
            width,
            height,
            source_bytes: source_length,
            output_bytes: texture.data.len() as u64,
            sha256: sha256_hex(&texture.data),
        });
    }

    let model_bytes = container::encode(&document)?;
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
    let total_bytes_saved = (source_bytes.len() as u64).saturating_sub(model_bytes.len() as u64);
    let output_to_source_ratio = if source_bytes.is_empty() {
        1.0
    } else {
        model_bytes.len() as f64 / source_bytes.len() as f64
    };

    let mut compatibility = inspection.compatibility.clone();
    compatibility
        .issues
        .retain(|issue| issue.code != "source_model_over_size_budget");
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
        nodes: inspection.nodes,
        textures: texture_artifacts,
        compatibility,
        publication: inspection.publication,
        optimization: OptimizationReport {
            lossless: true,
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
    decode_bounded(&texture.data, format).map_err(|source| PipelineError::TextureDecode {
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
    decode_bounded(&bytes, ImageFormat::Png).map_err(|source| PipelineError::TextureDecode {
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

fn decode_bounded(bytes: &[u8], format: ImageFormat) -> image::ImageResult<DynamicImage> {
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_TEXTURE_DIMENSION);
    limits.max_image_height = Some(MAX_TEXTURE_DIMENSION);
    limits.max_alloc = Some(MAX_TEXTURE_DECODE_ALLOC);
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
