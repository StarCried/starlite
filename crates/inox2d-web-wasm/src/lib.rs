//! Rust-to-WebAssembly boundary for the Inox2D browser runtime.
//!
//! URL loading, animation policy, browser lifecycle, and user interaction stay
//! in TypeScript. This crate accepts model bytes and exposes only deterministic
//! rendering and state-update operations.

#[cfg(any(target_arch = "wasm32", test))]
mod policy;

#[cfg(target_arch = "wasm32")]
mod runtime;

#[cfg(target_arch = "wasm32")]
pub use runtime::Inochi2dRuntime;

#[cfg(test)]
mod tests {
    use glam::Vec2;
    use inox2d::formats::inp::parse_inp;

    const PARAMETER_IDS: &[&str] = &[
        "HeadX",
        "HeadY",
        "HeadZ",
        "BodyX",
        "BodyY",
        "EyeOpenL",
        "EyeOpenR",
        "EyeX",
        "EyeY",
        "BrowL",
        "BrowR",
        "MouthOpen",
        "MouthForm",
        "Breath",
    ];

    #[test]
    fn synthetic_fixture_parses_and_accepts_public_parameters() {
        let payload = include_bytes!("../../../fixtures/synthetic-puppet.json");
        let mut bytes = b"TRNSRTS\0".to_vec();
        bytes.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        bytes.extend_from_slice(payload);
        bytes.extend_from_slice(b"TEX_SECT");
        bytes.extend_from_slice(&0_u32.to_be_bytes());

        let mut model = parse_inp(bytes.as_slice()).expect("synthetic INP must parse");
        model.puppet.init_transforms();
        model.puppet.init_rendering();
        model.puppet.init_params();
        model.puppet.init_physics();
        model.puppet.begin_frame();
        let parameter_context = model
            .puppet
            .param_ctx
            .as_mut()
            .expect("parameters are initialized");
        for id in PARAMETER_IDS {
            parameter_context
                .set(id, Vec2::ZERO)
                .unwrap_or_else(|error| panic!("fixture parameter {id} is invalid: {error}"));
        }
        model.puppet.end_frame(0.0);
    }
}
