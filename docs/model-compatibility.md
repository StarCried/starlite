# VRM model compatibility

StarLite accepts self-contained binary VRM 0.0 and VRM 1.0 humanoids. The
inspection result reports required/missing bones, usable blink and look-at
capabilities, discovered actions, and structural model metrics. A valid humanoid
with no actions gets the bundled `StarLiteIdle`, including its authored relaxed
pose and breathing. Automatic blink requires a usable standard combined blink
or both left/right eyelid morph expressions. Head following and eye following
are distinct capabilities: eye following uses the model's VRM bone or expression
look-at definition.

Missing optional capabilities are reported rather than invented. Head following
can work without eye following; a missing eyelid morph cannot be replaced by
merely registering an empty expression name. FBX, plain GLB, Unity controllers and
Warudo C# behavior are not VRM input. A role-specific data profile is optional;
Weiguang behavior is not applied to arbitrary imported characters.

## Actual-avatar qualification, 2026-10-19

These are three real third-party avatars, not variants of the synthetic test
mesh. They add long hair, different body and accessory proportions, mixed
PBR/MToon, bone/expression gaze, constraints and spring chains to the existing
Weiguang and artwork-free fixture checks.

| Model | Version / source exporter | Actions in file | Actual default behavior | Materials / secondary systems |
| --- | --- | ---: | --- | --- |
| three-vrm-girl 1.1 | VRM0; UniVRM 0.55.0 / UniGLTF 1.28 | 0 | `StarLiteIdle`; real blink morph; head and eye bones follow within limits | textured MToon; 90 spring joints |
| Seed-san 1 | VRM1; exporter not identified in file | 0 | `StarLiteIdle`; real blink morph; head plus look-at expression weights respond | textured PBR + MToon; 19 spring joints; 23 rotation constraints |
| Constraint Twist v1.0.1 | VRM1; exporter not identified in file | 0 | `StarLiteIdle`; real blink morph; head and eye bones follow within limits | textured MToon; 57 spring joints; 14 roll/aim constraints |
| Weiguang v3.0 blog | VRM0; Blender VRM exporter experimental 4.7.1 | 13 | embedded Idle/action catalogue; real blink and expression gaze; character profile retained | textured MToon; 41 spring joints |

The rendered-frame captures were visually inspected for full-body framing,
textures and shading. The tests additionally observed actual humanoid quaternions,
eyelid morph influence values and expression weights, not only registered names.
All four blink morphs reached 1.0. Both bone-gaze samples changed eye rotations;
both expression-gaze samples changed the left/right look expression weights.
All observed spring quaternions stayed finite, with motion in 78/90, 19/19,
57/57 and 35/41 joints respectively over the sampled idle/gaze sequence. These
are sampled functional checks, not a claim to verify every possible pose or
every individual constraint equation.

Seed-san's wide backpack affects automatic full-model framing, so it appears
smaller than a narrow avatar at the same widget size. This is not a loading
failure. Camera/display settings can be adjusted for accessory-heavy characters.
Automatic humanoid retargeting cannot guarantee that every character avoids
clothing intersections; preserve the source rig and inspect the result.

The three action-free public models received **only** StarLite's bundled Idle;
no extracted third-party motion pack was added. Weiguang's separate model license
and authored/selected action provenance remain separate from the program license.

## Pinned sources, permissions and attribution

All test binaries stay under ignored `target/maturity-validation/models/` and
are excluded from source/package artifacts. They are served only by a temporary
loopback server for local tests. There is no third-party model upload, public
example deployment or change to the binaries. The adjacent ignored
`*.source.json` files retain the download URL, byte count, SHA-256 and embedded
license settings. Permissions below were checked from those exact files and
their primary-source license pages; the program's BSD/MIT notices do not replace
an avatar's license.

| Model / author | Pinned source | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| three-vrm-girl / pixiv Inc. | [three-vrm commit 48019eb](https://github.com/pixiv/three-vrm/blob/48019ebcbbf021ef011ea26bc87d195834e02e03/packages/three-vrm/examples/models/three-vrm-girl.vrm) (`v0.6.11`) | 5,558,600 | `e6e179dea8bafc712900b5012628166a64e982d45566fb705d2ec52f579279b9` |
| Seed-san / VirtualCast, Inc. | [vrm-specification commit 94e82dd](https://github.com/vrm-c/vrm-specification/blob/94e82dd346fa6cf0337c4421728640e5252dd38e/samples/Seed-san/vrm/Seed-san.vrm) | 10,917,800 | `624d0d554bc205bbdc33e22a68a2c3c20edebb3e573011ead8878a65e5329b23` |
| Constraint Twist / © 2022 pixiv Inc. | [vrm-specification commit 94e82dd](https://github.com/vrm-c/vrm-specification/blob/94e82dd346fa6cf0337c4421728640e5252dd38e/samples/VRM1_Constraint_Twist_Sample/vrm/VRM1_Constraint_Twist_Sample.vrm) | 10,776,032 | `12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2` |
| Weiguang / StarCried | existing local author-generated blog derivative | 9,116,328 | `d98a431d84c015787a3239eaf709a7b3b075b4353c10ac59a3023f5ca4c05b8b` |

three-vrm-girl embeds a [VRoid Hub conditions URL](https://hub.vroid.com/en/license?allowed_to_use_user=everyone&characterization_allowed_user=everyone&corporate_commercial_use=allow&credit=unnecessary&modification=allow&personal_commercial_use=profit&redistribution=allow&sexual_expression=allow&version=1&violent_expression=allow)
allowing third-party/avatar use, modification and redistribution, with credit
optional. Attribution is retained here anyway. Its `licenseName: Other` does not
mean that it inherits the three-vrm software MIT license.

[Seed-san's model README](https://github.com/vrm-c/vrm-specification/blob/94e82dd346fa6cf0337c4421728640e5252dd38e/samples/Seed-san/README.md)
and [Constraint Twist's model README](https://github.com/vrm-c/vrm-specification/blob/94e82dd346fa6cf0337c4421728640e5252dd38e/samples/VRM1_Constraint_Twist_Sample/README.md)
refer to [VRM Public License 1.0](https://vrm.dev/en/licenses/1.0/index), established
2021-08-05, together with each model's embedded settings. Both exact files allow
everyone avatar use, corporate commercial use, redistribution and modification
with redistribution. Seed-san requires credit to VirtualCast, Inc.; Constraint
Twist marks credit optional. Applicable expression restrictions still apply.
These local checks use ordinary noncommercial idle/gaze animation. The license
provides the data as-is; this documentation does not imply endorsement by either
author.

## Scope of the evidence

The matrix uses isolated Windows Chrome 155 with WebGL2 and a physical RTX 5080,
plus a source-observer build that records the loaded VRM's public Three/three-vrm
state. Production-bundle performance is measured separately; see
[performance](performance.md). Ignored feature evidence is
`target/maturity-validation/feature-qualification.json` and screenshots in the
same directory. No personal browser profile is used.

The full test suite also covers artwork-free VRM0/1 fixtures, missing optional
expressions, malformed GLB/resource references, cancellation and repeated
mount/destroy. This matrix broadens those tests; it does not certify arbitrary
exporters, arbitrary motion packs, mobile rendering or browsers outside the
documented desktop Chrome/Edge WebGL2 support. No low-end-device performance claim
is inferred from these high-end hardware results.
