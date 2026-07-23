use serde_json::Value;

use crate::model::TextureFormat;
use crate::{PipelineError, Result};

const MAGIC: &[u8; 8] = b"TRNSRTS\0";
const TEXTURE_SECTION: &[u8; 8] = b"TEX_SECT";
const EXTENDED_SECTION: &[u8; 8] = b"EXT_SECT";
const MAX_PAYLOAD_BYTES: usize = 16 * 1024 * 1024;
const MAX_TEXTURE_COUNT: usize = 256;
const MAX_TEXTURE_BYTES: usize = 32 * 1024 * 1024;
const MAX_TOTAL_TEXTURE_BYTES: usize = 64 * 1024 * 1024;
const MAX_EXTENDED_BYTES: usize = 8 * 1024 * 1024;
const MAX_VENDOR_COUNT: usize = 256;
const MAX_VENDOR_NAME_BYTES: usize = 1024;
const MAX_VENDOR_PAYLOAD_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextureEntry {
    pub format: TextureFormat,
    pub data: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct InpDocument {
    pub payload: Vec<u8>,
    pub payload_json: Value,
    pub textures: Vec<TextureEntry>,
    pub extended_section: Vec<u8>,
    pub vendor_count: usize,
}

pub fn parse(bytes: &[u8]) -> Result<InpDocument> {
    let mut reader = Reader::new(bytes);
    if reader.take(8)? != MAGIC {
        return Err(PipelineError::InvalidContainer(
            "magic bytes do not match an INP/INX file".to_owned(),
        ));
    }

    let payload_length = reader.read_u32()? as usize;
    enforce_limit("JSON payload", payload_length, MAX_PAYLOAD_BYTES)?;
    let payload = reader.take(payload_length)?.to_vec();
    let payload_json = serde_json::from_slice(&payload)?;

    if reader.take(8)? != TEXTURE_SECTION {
        return Err(PipelineError::InvalidContainer(
            "texture section is missing".to_owned(),
        ));
    }

    let texture_count = reader.read_u32()? as usize;
    enforce_limit("texture count", texture_count, MAX_TEXTURE_COUNT)?;
    let mut textures = Vec::with_capacity(texture_count);
    let mut total_texture_bytes = 0_usize;
    for index in 0..texture_count {
        let length = reader.read_u32()? as usize;
        enforce_limit("texture payload", length, MAX_TEXTURE_BYTES)?;
        total_texture_bytes = total_texture_bytes.checked_add(length).ok_or_else(|| {
            PipelineError::InvalidContainer("total texture byte count overflow".to_owned())
        })?;
        enforce_limit(
            "total texture payload",
            total_texture_bytes,
            MAX_TOTAL_TEXTURE_BYTES,
        )?;
        let encoding = reader.read_u8()?;
        let format = TextureFormat::try_from(encoding).map_err(|value| {
            PipelineError::InvalidContainer(format!(
                "texture {index} uses unknown encoding {value}"
            ))
        })?;
        textures.push(TextureEntry {
            format,
            data: reader.take(length)?.to_vec(),
        });
    }

    let extended_section = reader.remaining().to_vec();
    enforce_limit(
        "extended vendor section",
        extended_section.len(),
        MAX_EXTENDED_BYTES,
    )?;
    let vendor_count = validate_extended_section(&extended_section)?;

    Ok(InpDocument {
        payload,
        payload_json,
        textures,
        extended_section,
        vendor_count,
    })
}

pub fn encode(document: &InpDocument) -> Result<Vec<u8>> {
    let mut output = Vec::new();
    output.extend_from_slice(MAGIC);
    output.extend_from_slice(&as_u32(document.payload.len(), "payload")?.to_be_bytes());
    output.extend_from_slice(&document.payload);
    output.extend_from_slice(TEXTURE_SECTION);
    output.extend_from_slice(&as_u32(document.textures.len(), "texture count")?.to_be_bytes());
    for (index, texture) in document.textures.iter().enumerate() {
        output.extend_from_slice(
            &as_u32(texture.data.len(), &format!("texture {index}"))?.to_be_bytes(),
        );
        output.push(texture.format.encoding());
        output.extend_from_slice(&texture.data);
    }
    output.extend_from_slice(&document.extended_section);
    Ok(output)
}

fn validate_extended_section(bytes: &[u8]) -> Result<usize> {
    if bytes.is_empty() {
        return Ok(0);
    }

    let mut reader = Reader::new(bytes);
    if reader.take(8)? != EXTENDED_SECTION {
        return Err(PipelineError::InvalidContainer(
            "unexpected data follows the texture section".to_owned(),
        ));
    }

    let count = reader.read_u32()? as usize;
    enforce_limit("vendor entry count", count, MAX_VENDOR_COUNT)?;
    for index in 0..count {
        let name_length = reader.read_u32()? as usize;
        enforce_limit("vendor name", name_length, MAX_VENDOR_NAME_BYTES)?;
        let name = reader.take(name_length)?;
        std::str::from_utf8(name).map_err(|error| {
            PipelineError::InvalidContainer(format!("vendor {index} name is not UTF-8: {error}"))
        })?;

        let payload_length = reader.read_u32()? as usize;
        enforce_limit(
            "vendor JSON payload",
            payload_length,
            MAX_VENDOR_PAYLOAD_BYTES,
        )?;
        let payload = reader.take(payload_length)?;
        serde_json::from_slice::<Value>(payload).map_err(|error| {
            PipelineError::InvalidContainer(format!(
                "vendor {index} payload is not valid JSON: {error}"
            ))
        })?;
    }

    if !reader.remaining().is_empty() {
        return Err(PipelineError::InvalidContainer(
            "unexpected data follows the extended vendor section".to_owned(),
        ));
    }

    Ok(count)
}

fn enforce_limit(label: &str, actual: usize, maximum: usize) -> Result<()> {
    if actual > maximum {
        return Err(PipelineError::InvalidContainer(format!(
            "{label} is {actual}; the limit is {maximum}"
        )));
    }
    Ok(())
}

fn as_u32(value: usize, label: &str) -> Result<u32> {
    u32::try_from(value).map_err(|_| {
        PipelineError::InvalidContainer(format!("{label} exceeds the INP/INX u32 limit"))
    })
}

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn read_u8(&mut self) -> Result<u8> {
        Ok(self.take(1)?[0])
    }

    fn read_u32(&mut self) -> Result<u32> {
        let bytes: [u8; 4] = self
            .take(4)?
            .try_into()
            .expect("reader returned exactly four bytes");
        Ok(u32::from_be_bytes(bytes))
    }

    fn take(&mut self, length: usize) -> Result<&'a [u8]> {
        let end = self.offset.checked_add(length).ok_or_else(|| {
            PipelineError::InvalidContainer("container offset overflow".to_owned())
        })?;
        if end > self.bytes.len() {
            return Err(PipelineError::InvalidContainer(format!(
                "container is truncated at byte {} (wanted {length} more bytes)",
                self.offset
            )));
        }
        let result = &self.bytes[self.offset..end];
        self.offset = end;
        Ok(result)
    }

    fn remaining(&self) -> &'a [u8] {
        &self.bytes[self.offset..]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn document() -> InpDocument {
        let payload = br#"{"meta":{}}"#.to_vec();
        InpDocument {
            payload: payload.clone(),
            payload_json: serde_json::from_slice(&payload).unwrap(),
            textures: vec![TextureEntry {
                format: TextureFormat::Png,
                data: vec![1, 2, 3],
            }],
            extended_section: Vec::new(),
            vendor_count: 0,
        }
    }

    #[test]
    fn round_trips_container_without_reordering_textures() {
        let expected = document();
        let bytes = encode(&expected).unwrap();
        let actual = parse(&bytes).unwrap();
        assert_eq!(actual.payload, expected.payload);
        assert_eq!(actual.textures, expected.textures);
        assert_eq!(actual.extended_section, expected.extended_section);
    }

    #[test]
    fn rejects_truncated_texture_data() {
        let mut bytes = encode(&document()).unwrap();
        bytes.pop();
        let error = parse(&bytes).unwrap_err().to_string();
        assert!(error.contains("truncated"), "{error}");
    }

    #[test]
    fn preserves_valid_vendor_bytes_exactly() {
        let mut expected = document();
        expected
            .extended_section
            .extend_from_slice(EXTENDED_SECTION);
        expected
            .extended_section
            .extend_from_slice(&1_u32.to_be_bytes());
        expected
            .extended_section
            .extend_from_slice(&4_u32.to_be_bytes());
        expected.extended_section.extend_from_slice(b"test");
        expected
            .extended_section
            .extend_from_slice(&2_u32.to_be_bytes());
        expected.extended_section.extend_from_slice(b"{}");
        expected.vendor_count = 1;

        let bytes = encode(&expected).unwrap();
        let actual = parse(&bytes).unwrap();
        assert_eq!(actual.extended_section, expected.extended_section);
        assert_eq!(actual.vendor_count, 1);
    }

    #[test]
    fn rejects_oversized_declared_payload_before_allocating() {
        let mut bytes = MAGIC.to_vec();
        bytes.extend_from_slice(&((MAX_PAYLOAD_BYTES + 1) as u32).to_be_bytes());
        let error = parse(&bytes).unwrap_err().to_string();
        assert!(error.contains("JSON payload"), "{error}");
        assert!(error.contains("limit"), "{error}");
    }

    #[test]
    fn rejects_excessive_texture_count() {
        let payload = b"{}".to_vec();
        let mut bytes = MAGIC.to_vec();
        bytes.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        bytes.extend_from_slice(&payload);
        bytes.extend_from_slice(TEXTURE_SECTION);
        bytes.extend_from_slice(&((MAX_TEXTURE_COUNT + 1) as u32).to_be_bytes());
        let error = parse(&bytes).unwrap_err().to_string();
        assert!(error.contains("texture count"), "{error}");
    }
}
