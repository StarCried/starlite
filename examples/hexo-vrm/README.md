# Isolated VRM Hexo example

Run `npm run build --workspace @starcried/starlite-hexo-vrm-example`, then `npm run
serve --workspace @starcried/starlite-hexo-vrm-example`. The example generates an
artwork-free VRM 1.0 triangle and a head motion, verifies its prepared manifest,
and runs Hexo in `.generated`. It does not read or deploy a real blog.
On a desktop viewport, the triangle loads after the document load and an idle
opportunity. Mobile loads no model or renderer. The PJAX button retains one
instance. Block the renderer request to exercise the static fallback.
