mod build;
mod container;
mod inspect;
pub mod model;

use std::fs;
use std::path::{Path, PathBuf};

pub use build::{build, BuildRequest};
pub use model::{BuildManifest, InspectionReport};
use sha2::{Digest, Sha256};

pub type Result<T> = std::result::Result<T, PipelineError>;

pub const MAX_INPUT_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum PipelineError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid JSON payload: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid INP/INX container: {0}")]
    InvalidContainer(String),
    #[error("texture {index} ({format}) could not be decoded: {source}")]
    TextureDecode {
        index: usize,
        format: &'static str,
        #[source]
        source: image::ImageError,
    },
    #[error("texture {index} could not be encoded as PNG: {source}")]
    TextureEncode {
        index: usize,
        #[source]
        source: image::ImageError,
    },
    #[error("model is outside the browser compatibility profile: {0}")]
    UnsupportedModel(String),
    #[error("optimized model failed pinned Inox2D runtime validation: {0}")]
    RuntimeValidation(String),
    #[error("output directory already exists: {0}")]
    OutputExists(PathBuf),
    #[error("invalid argument: {0}")]
    InvalidArgument(String),
    #[error("{label} is {actual} bytes; the limit is {maximum} bytes")]
    InputTooLarge {
        label: &'static str,
        actual: u64,
        maximum: u64,
    },
}

pub fn inspect_file(path: &Path) -> Result<InspectionReport> {
    let bytes = read_limited_file(path, "model", MAX_INPUT_BYTES)?;
    let document = container::parse(&bytes)?;
    inspect::inspect(&bytes, &document)
}

pub(crate) fn read_limited_file(path: &Path, label: &'static str, maximum: u64) -> Result<Vec<u8>> {
    let length = fs::metadata(path)?.len();
    if length > maximum {
        return Err(PipelineError::InputTooLarge {
            label,
            actual: length,
            maximum,
        });
    }
    let bytes = fs::read(path)?;
    if bytes.len() as u64 > maximum {
        return Err(PipelineError::InputTooLarge {
            label,
            actual: bytes.len() as u64,
            maximum,
        });
    }
    Ok(bytes)
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
