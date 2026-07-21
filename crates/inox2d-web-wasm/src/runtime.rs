use std::collections::HashMap;

use glam::Vec2;
use inox2d::formats::inp::parse_inp;
use inox2d::puppet::Puppet;
use inox2d::render::InoxRendererExt;
use inox2d_opengl::OpenglRenderer;
use js_sys::{Object, Reflect};
use wasm_bindgen::{prelude::*, JsCast};
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext};

use crate::policy::{frame_delta_seconds, physical_extent};

/// Stateful Inox2D renderer bound to one HTML canvas.
#[wasm_bindgen]
pub struct Inochi2dRuntime {
    canvas: HtmlCanvasElement,
    renderer: Option<OpenglRenderer>,
    puppet: Option<Puppet>,
    parameters: HashMap<String, Vec2>,
    initial_scale: f32,
    last_timestamp_ms: Option<f64>,
    destroyed: bool,
}

#[wasm_bindgen]
impl Inochi2dRuntime {
    /// Create a renderer shell. WebGL resources are allocated only after loading a model.
    #[wasm_bindgen(constructor)]
    pub fn new(canvas: HtmlCanvasElement, options: JsValue) -> Result<Inochi2dRuntime, JsValue> {
        console_error_panic_hook::set_once();

        let initial_scale = Reflect::get(&options, &JsValue::from_str("initialScale"))
            .ok()
            .and_then(|value| value.as_f64())
            .filter(|value| value.is_finite() && *value > 0.0)
            .unwrap_or(0.15) as f32;

        Ok(Self {
            canvas,
            renderer: None,
            puppet: None,
            parameters: HashMap::new(),
            initial_scale,
            last_timestamp_ms: None,
            destroyed: false,
        })
    }

    /// Parse Creator-exported INP bytes and upload their render resources.
    #[wasm_bindgen(js_name = loadModel)]
    pub fn load_model(&mut self, model_bytes: &[u8]) -> Result<(), JsValue> {
        self.ensure_active()?;
        if self.puppet.is_some() {
            return Err(js_error("a model is already loaded"));
        }

        let mut model = parse_inp(model_bytes).map_err(|error| js_error(&error.to_string()))?;
        model.puppet.init_transforms();
        model.puppet.init_rendering();
        model.puppet.init_params();
        model.puppet.init_physics();

        let gl = create_webgl2_context(&self.canvas)?;
        let mut renderer =
            OpenglRenderer::new(gl, &model).map_err(|error| js_error(&error.to_string()))?;
        renderer.camera.scale = Vec2::splat(self.initial_scale);
        renderer.resize(self.canvas.width().max(1), self.canvas.height().max(1));

        self.puppet = Some(model.puppet);
        self.renderer = Some(renderer);
        self.last_timestamp_ms = None;
        Ok(())
    }

    /// Set both axes of an Inochi2D parameter.
    #[wasm_bindgen(js_name = setParameterVector)]
    pub fn set_parameter_vector(&mut self, id: &str, x: f32, y: f32) -> Result<(), JsValue> {
        self.ensure_active()?;
        if !x.is_finite() || !y.is_finite() {
            return Err(js_error("parameter values must be finite"));
        }
        let value = Vec2::new(x, y);
        let puppet = self.loaded_puppet_mut()?;
        puppet
            .param_ctx
            .as_mut()
            .expect("loaded puppets always initialize parameters")
            .set(id, value)
            .map_err(|error| js_error(&error.to_string()))?;
        self.parameters.insert(id.to_owned(), value);
        Ok(())
    }

    /// Set the first axis of an Inochi2D parameter.
    #[wasm_bindgen(js_name = setParameterScalar)]
    pub fn set_parameter_scalar(&mut self, id: &str, value: f32) -> Result<(), JsValue> {
        self.set_parameter_vector(id, value, 0.0)
    }

    /// Set camera translation in model units and a uniform positive scale.
    #[wasm_bindgen(js_name = setCameraTransform)]
    pub fn set_camera_transform(&mut self, x: f32, y: f32, scale: f32) -> Result<(), JsValue> {
        self.ensure_active()?;
        if !x.is_finite() || !y.is_finite() || !scale.is_finite() || scale <= 0.0 {
            return Err(js_error(
                "camera values must be finite and scale must be positive",
            ));
        }
        let renderer = self.loaded_renderer_mut()?;
        renderer.camera.position = Vec2::new(x, y);
        renderer.camera.scale = Vec2::splat(scale);
        // Inox2D's lightweight camera-uniform refresh is private at the pinned
        // revision. Resizing to the current viewport is the public correctness
        // fallback until upstream exposes that refresh operation.
        let viewport = renderer.viewport;
        renderer.resize(viewport.x.max(1), viewport.y.max(1));
        Ok(())
    }

    /// Resize the backing buffer from CSS pixels and device-pixel ratio.
    #[wasm_bindgen]
    pub fn resize(
        &mut self,
        width: f64,
        height: f64,
        device_pixel_ratio: f64,
    ) -> Result<(), JsValue> {
        self.ensure_active()?;
        let physical_width = physical_extent(width, device_pixel_ratio);
        let physical_height = physical_extent(height, device_pixel_ratio);
        self.canvas.set_width(physical_width);
        self.canvas.set_height(physical_height);
        self.loaded_renderer_mut()?
            .resize(physical_width, physical_height);
        Ok(())
    }

    /// Advance physics, apply current parameter values, and draw one frame.
    #[wasm_bindgen(js_name = renderFrame)]
    pub fn render_frame(&mut self, timestamp_ms: f64) -> Result<(), JsValue> {
        self.ensure_active()?;
        let delta = frame_delta_seconds(self.last_timestamp_ms, timestamp_ms);
        self.last_timestamp_ms = Some(timestamp_ms);

        let (renderer, puppet) = match (&self.renderer, &mut self.puppet) {
            (Some(renderer), Some(puppet)) => (renderer, puppet),
            _ => return Err(js_error("no model is loaded")),
        };

        puppet.begin_frame();
        let parameter_context = puppet
            .param_ctx
            .as_mut()
            .expect("loaded puppets always initialize parameters");
        for (id, value) in &self.parameters {
            parameter_context
                .set(id, *value)
                .map_err(|error| js_error(&error.to_string()))?;
        }
        puppet.end_frame(delta);

        renderer.clear();
        renderer.on_begin_draw(puppet);
        renderer.draw(puppet);
        renderer.on_end_draw(puppet);
        Ok(())
    }

    /// Drop Rust-side puppet and renderer state. The browser reclaims WebGL handles.
    #[wasm_bindgen]
    pub fn destroy(&mut self) {
        self.parameters.clear();
        self.puppet = None;
        self.renderer = None;
        self.last_timestamp_ms = None;
        self.destroyed = true;
    }
}

impl Inochi2dRuntime {
    fn ensure_active(&self) -> Result<(), JsValue> {
        if self.destroyed {
            Err(js_error("runtime has been destroyed"))
        } else {
            Ok(())
        }
    }

    fn loaded_puppet_mut(&mut self) -> Result<&mut Puppet, JsValue> {
        self.puppet
            .as_mut()
            .ok_or_else(|| js_error("no model is loaded"))
    }

    fn loaded_renderer_mut(&mut self) -> Result<&mut OpenglRenderer, JsValue> {
        self.renderer
            .as_mut()
            .ok_or_else(|| js_error("no model is loaded"))
    }
}

fn create_webgl2_context(canvas: &HtmlCanvasElement) -> Result<glow::Context, JsValue> {
    let attributes = Object::new();
    Reflect::set(&attributes, &JsValue::from_str("alpha"), &JsValue::TRUE)?;
    Reflect::set(&attributes, &JsValue::from_str("stencil"), &JsValue::TRUE)?;
    Reflect::set(
        &attributes,
        &JsValue::from_str("premultipliedAlpha"),
        &JsValue::TRUE,
    )?;

    let context = canvas
        .get_context_with_context_options("webgl2", &attributes)?
        .ok_or_else(|| js_error("WebGL2 is unavailable"))?
        .dyn_into::<WebGl2RenderingContext>()
        .map_err(|_| js_error("browser returned an invalid WebGL2 context"))?;

    Ok(glow::Context::from_webgl2_context(context))
}

fn js_error(message: &str) -> JsValue {
    js_sys::Error::new(message).into()
}
