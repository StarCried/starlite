# Performance and budgets

StarLite loads one selected rendering backend. A VRM companion still needs a
WebGL2 renderer, decoded textures, skinned geometry and a browser/WebView process.
The size of the npm plugin is not its download, GPU-memory or idle-power cost.

## Show local measurements

For Hexo, add this to `_config.yml`:

```yaml
starlite:
  performance:
    show: true
```

The corner panel is off by default. It works in both renderers, does not receive
pointer events, sends no telemetry and can be removed by setting `show: false`.
An application embedding the core contract can also call
`controller.setPerformanceVisible?.(true)` and pass `performance: { show: true }`
when mounting a widget.

- **FPS** counts rendered frames, not every `requestAnimationFrame` callback.
- **Frame p95** is the 95th percentile of intervals between rendered frames.
  A 30 FPS cap normally has intervals near 33.3 ms; this is not 60 FPS dropped to 30.
- **CPU p95** is elapsed wall time for model update, WebGL submission and the
  scheduled hit-mask readback, including driver waits. It is neither CPU
  utilization nor GPU execution time.
- **Calls / tris**, where available, are renderer draw statistics. Outline and
  other passes can draw the same mesh more than once.

The panel uses at most 240 recent samples and refreshes at most twice per second.
Pause/hidden-page intervals do not become a long catch-up update on resume.
It does not probe memory or read pixels back from WebGL. The VRM diagnostics API
retains a separate bounded history for local qualification tools.

## Browser payload gates

`npm run check:runtime-budget` checks the actual built browser files. It excludes
source maps, declarations and Node-only inspection/preparation modules. Each
file is compressed separately with gzip level 9 and Brotli quality 11. This is a
comparison format, not a claim that the site's server enables either encoding.
Supported Node/zlib versions may produce slightly different compressed bytes.

| Backend | Counted files | Raw maximum | gzip maximum | Brotli maximum |
| --- | --- | ---: | ---: | ---: |
| VRM | bundled `index.js` and `widget.css` | 1,280,000 B | 320,000 B | 255,000 B |
| Inochi2D | distributed browser JavaScript and WASM | 1,572,864 B | 225,000 B | 185,000 B |

VRM includes Three.js, three-vrm, the common component and the bundled author-owned
Idle. Its initial baseline was 1,166,631 B raw, 288,309 B gzip and 229,226 B
Brotli with Windows Node 24. The limits allow approximately 10% growth. Inochi2D
keeps its previous 1.5 MiB raw ceiling; its new encoded ceilings are approximately
12% above the recorded baseline. These limits live in
[`tools/performance-budget.json`](../tools/performance-budget.json). Raising a
limit needs a measured reason and review, rather than adjusting it to silence a
failure.

The default Weiguang blog model is **9,116,328 B** separately from this runtime;
it includes 13 authored actions. Its textures, morphs and animations belong to
the model budget. Program-package checks continue to reject model and source-art
files in npm tarballs. Hexo's public single-model ceiling is 10 MiB; that ceiling
does not imply that every 10 MiB avatar renders equally quickly.

To save the measured sizes:

```sh
node tools/verify-runtime-budget.mjs --report target/runtime-size.json
```

## Fixed-scene runtime gates

Runtime performance depends on the model and device, so the gate requires a
recorded environment, browser, actual GL renderer, model SHA-256, viewport, DPR,
FPS cap, sample duration and rendered-frame count. It rejects missing/non-finite
metrics, short samples and comparisons made with different models or devices.

The `physical30` target is a visible **320 × 480 CSS px, DPR 1, 30 FPS** local
scene, sampled for at least 10 seconds and 200 rendered frames after warm-up:

| Measurement | Target |
| --- | ---: |
| Rendered FPS | at least 27 |
| Frame-interval p95 | at most 50 ms |
| Model-update + submission p95 | at most 16.7 ms |
| Local model fetch/decode/compile | at most 10 seconds |

The same fixed scene also has an opt-in `physical60` gate: at least 54 FPS,
frame p95 at most 25 ms and update/submission p95 at most 8.3 ms. It is measured
separately; passing the 30 FPS target does not imply a 60 FPS result.

This target is a qualification scene, not a promise for arbitrary models or
low-end hardware. A remote network download is measured separately. SwiftShader,
llvmpipe and other software renderers cannot pass as physical-GPU evidence.

```sh
node tools/verify-performance-report.mjs target/sample.json --profile physical30
node tools/verify-performance-report.mjs target/sample-60.json --profile physical60
node tools/verify-performance-report.mjs target/current.json --baseline target/baseline.json
```

The relative gate requires the same scene and environment: FPS may fall at most
15%; frame p95 may grow at most 20%; update/submission p95 at most 20% or 1 ms;
local load at most 25% or 150 ms. The absolute tolerances avoid treating
sub-millisecond timer noise as a regression. Same-scene renderer geometry and
texture counts may not grow; measured JS heap may grow at most 8 MiB. A report
can explicitly set heap to `null` when unavailable. This does not silently count
unavailable memory as zero. Optional mount/destroy records require at least 20
cycles and stable renderer resource counts.

Headless software runs can use the relative gate against the same software
environment. Their FPS and CPU times must be labelled software measurements.
They do not establish laptop GPU speed or power consumption.

### Whole-process long-run profile

`ownedBrowserWeiguang` adds a separate, deliberately machine-specific cost gate:
the pinned Weiguang blog model, Windows Chrome 155 and RTX 5080 at the fixed
320 × 480, DPR 1, 30 FPS scene. It requires measured process-tree RAM, CPU time
and WDDM GPU counters from a private browser instance, with at least 16 samples
from 30 seconds through 15 minutes and no sample gap above 60 seconds. Missing
counters fail this gate; JS heap does not stand in for process memory.

| Cost | Qualification ceiling |
| --- | ---: |
| Sampled whole-browser private committed memory, including sampled load/cycles | 1 GiB |
| Sampled dedicated GPU allocation | 256 MiB |
| Sampled shared GPU allocation | 64 MiB |
| Private-memory growth after the 30-second idle baseline | 64 MiB |
| Dedicated-GPU growth after that baseline | 32 MiB |
| Comparable post-GC JS-heap growth | 8 MiB |
| Average owned-process CPU time / elapsed time | 20% of one logical CPU core |

The absolute limits include the browser engine and driver caches. They provide
headroom above the observed approximately 630 MiB private / 146 MiB dedicated-GPU
idle scene, while the growth gates catch a continuing increase. They are not a
claim that the companion uses little total RAM, nor do they set requirements for
other models, browser versions or devices. The CPU figure sums owned processes;
machine-wide utilization divides that figure by the logical CPU count. GPU
allocations are sampled counters, not continuous peak GPU utilization.

```sh
node tools/verify-performance-report.mjs target/long-run-complete.json --profile ownedBrowserWeiguang
```

The accompanying resource test mounts/destroys 20 real models, checks that each
old WebGL context is lost and its canvas removed, then measures the new running
scene. Browser private committed memory is allowed to retain caches after a
context is released; a removed canvas alone is not proof that process RAM has
returned to its empty-browser baseline.

## Current local qualification

On 2026-10-19, isolated Chrome 155.0.8059.80 on Windows reported
`ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 … D3D11)`. The frozen runtime bundle SHA-256
was `d0b467dcf3c945bec73b30aa091d4fcb3ceef418761ea794a7237158232c4385`.
Each avatar used the fixed scene above with a 2-second warm-up and 15-second
sample. No personal browser profile or model API was used.

| Avatar | FPS | Frame p95 | Update/submission p95 | Local load | Geometries / textures |
| --- | ---: | ---: | ---: | ---: | ---: |
| three-vrm-girl / VRM0 | 29.98 | 35.0 ms | 1.4 ms | 601 ms | 17 / 34 |
| Seed-san / VRM1 | 29.99 | 35.1 ms | 1.2 ms | 808 ms | 21 / 19 |
| Constraint Twist / VRM1 | 29.98 | 35.1 ms | 0.6 ms | 542 ms | 13 / 26 |
| Weiguang blog / VRM0 | 29.98 | 35.0 ms | 0.5 ms | 449 ms | 6 / 8 |

All four passed the absolute target and the same-machine relative gate against
their preceding recorded baseline. This high-end GPU result cannot establish
integrated-GPU performance. Model sources, capabilities and licensing are in
[model compatibility](model-compatibility.md).

The same Weiguang scene at a 60 FPS cap was measured separately: **60.04 FPS**,
21.1 ms frame p95, 0.6 ms update/submission p95 and 476 ms local load. It passed
`physical60`. It renders approximately twice as many frames; these numbers do
not establish equal idle GPU power at 30 and 60 FPS.

Ignored raw evidence is in `target/maturity-validation/`: the per-model
`*-physical-candidate.json` files, `performance-gate-results.json`, runtime-size
report and screenshots. The observer-instrumented feature tests are separate
from these performance runs, which load the real production bundle.

## Practical tuning

Keep antialiasing enabled: disabling it was visually rejected during this
project's device testing. Start with a 30 FPS cap and DPR 1; raise FPS or DPR only
after checking the target device. Lowering DPR reduces raster work without
discarding model features. The default companion pauses while hidden.

Model-side changes often matter more than a small JavaScript saving: reduce
unused texture resolution, excessive transparent layers and duplicated outline
passes, and remove genuinely unused meshes or morph data in an author-controlled
derivative. Check eyes, hair and facial expressions after every change. Do not
blindly merge custom morphs or overwrite the source model.

Profile the whole page too. A continuously redrawn large background can limit a
small companion's frame rate even when its own update cost is low. Keep static
background work cached and avoid full-viewport work every frame.

For memory reports, distinguish post-GC JavaScript heap, renderer resource counts,
GPU counters and the browser/WebView process tree. Working sets may contain shared
pages; JS heap and `renderer.info.memory` are not total GPU or process RAM. A
quiet-companion claim also needs physical-device CPU/GPU and power checks; this
project does not extrapolate those from bundle bytes or headless FPS.
