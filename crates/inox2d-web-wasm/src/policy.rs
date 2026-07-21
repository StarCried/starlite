const MAX_FRAME_DELTA_SECONDS: f64 = 1.0 / 15.0;

/// Convert two animation timestamps into a bounded physics delta.
pub(crate) fn frame_delta_seconds(previous_ms: Option<f64>, timestamp_ms: f64) -> f32 {
    let Some(previous_ms) = previous_ms else {
        return 0.0;
    };

    if !previous_ms.is_finite() || !timestamp_ms.is_finite() || timestamp_ms <= previous_ms {
        return 0.0;
    }

    ((timestamp_ms - previous_ms) / 1000.0).min(MAX_FRAME_DELTA_SECONDS) as f32
}

/// Convert a CSS extent and DPR into a non-zero framebuffer extent.
pub(crate) fn physical_extent(css_extent: f64, device_pixel_ratio: f64) -> u32 {
    if !css_extent.is_finite() || !device_pixel_ratio.is_finite() {
        return 1;
    }

    (css_extent.max(0.0) * device_pixel_ratio.max(0.0))
        .round()
        .clamp(1.0, u32::MAX as f64) as u32
}

#[cfg(test)]
mod tests {
    use super::{frame_delta_seconds, physical_extent};

    #[test]
    fn first_or_reversed_timestamp_has_no_physics_step() {
        assert_eq!(frame_delta_seconds(None, 1000.0), 0.0);
        assert_eq!(frame_delta_seconds(Some(1000.0), 999.0), 0.0);
        assert_eq!(frame_delta_seconds(Some(f64::NAN), 1000.0), 0.0);
    }

    #[test]
    fn long_frame_delta_is_bounded() {
        let delta = frame_delta_seconds(Some(0.0), 1000.0);
        assert!((delta - (1.0 / 15.0)).abs() < f32::EPSILON);
    }

    #[test]
    fn framebuffer_extent_is_rounded_and_never_zero() {
        assert_eq!(physical_extent(260.0, 1.25), 325);
        assert_eq!(physical_extent(0.0, 1.25), 1);
        assert_eq!(physical_extent(f64::NAN, 1.25), 1);
    }
}
