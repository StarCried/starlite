use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::Value;

pub const MANIFEST_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentIdentity {
    pub sha256: String,
    pub bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataReport {
    pub name: Option<String>,
    pub version: Option<String>,
    pub rigger: Option<String>,
    pub artist: Option<String>,
    pub copyright: Option<String>,
    pub license_url: Option<String>,
    pub contact: Option<String>,
    pub reference: Option<String>,
    pub rights: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterProfile {
    pub name: String,
    pub is_vector: bool,
    pub min: [f64; 2],
    pub max: [f64; 2],
    pub defaults: [f64; 2],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeSummary {
    pub count: usize,
    pub types: BTreeMap<String, usize>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueSeverity {
    Error,
    Warning,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub code: String,
    pub severity: IssueSeverity,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityReport {
    pub supported: bool,
    pub issues: Vec<Issue>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicationReport {
    pub requires_confirmation: bool,
    pub issues: Vec<Issue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub declared_rights: Option<Value>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TextureFormat {
    Png,
    Tga,
    Bc7,
}

impl TextureFormat {
    pub fn encoding(self) -> u8 {
        match self {
            Self::Png => 0,
            Self::Tga => 1,
            Self::Bc7 => 2,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Tga => "tga",
            Self::Bc7 => "bc7",
        }
    }
}

impl TryFrom<u8> for TextureFormat {
    type Error = u8;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Png),
            1 => Ok(Self::Tga),
            2 => Ok(Self::Bc7),
            other => Err(other),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureInspection {
    pub index: usize,
    pub format: TextureFormat,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectionReport {
    pub schema_version: u32,
    pub source: ContentIdentity,
    pub payload_bytes: u64,
    pub vendor_count: usize,
    pub metadata: MetadataReport,
    pub parameters: Vec<ParameterProfile>,
    pub nodes: NodeSummary,
    pub textures: Vec<TextureInspection>,
    pub compatibility: CompatibilityReport,
    pub publication: PublicationReport,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedArtifact {
    pub file: String,
    pub sha256: String,
    pub bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelArtifact {
    pub file: String,
    pub sha256: String,
    pub bytes: u64,
    pub source_sha256: String,
    pub source_bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextureArtifact {
    pub index: usize,
    pub source_format: TextureFormat,
    pub output_format: TextureFormat,
    pub width: u32,
    pub height: u32,
    pub source_bytes: u64,
    pub output_bytes: u64,
    pub sha256: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationReport {
    pub lossless: bool,
    pub converted_tga_to_png: usize,
    pub retained_tga: usize,
    pub recompressed_png: usize,
    pub source_texture_bytes: u64,
    pub output_texture_bytes: u64,
    pub total_bytes_saved: u64,
    pub output_to_source_ratio: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildManifest {
    pub schema_version: u32,
    pub tool: String,
    pub tool_version: String,
    pub model: ModelArtifact,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback: Option<PublishedArtifact>,
    pub payload_bytes: u64,
    pub vendor_count: usize,
    pub metadata: MetadataReport,
    pub parameters: Vec<ParameterProfile>,
    pub nodes: NodeSummary,
    pub textures: Vec<TextureArtifact>,
    pub compatibility: CompatibilityReport,
    pub publication: PublicationReport,
    pub optimization: OptimizationReport,
}
