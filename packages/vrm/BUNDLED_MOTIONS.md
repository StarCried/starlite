# Bundled motion provenance

StarLite includes four model-independent humanoid motions. No character mesh,
texture, skin, private Blender project or proprietary expression is included.

| Runtime name | Duration | Source |
| --- | --- | --- |
| StarLiteIdle | 6 s | See [DEFAULT_IDLE.md](DEFAULT_IDLE.md). |
| StarLiteCuriousPeek | 2.1 s | Authored by StarCried for StarLite. |
| StarLiteHappyWave | 4.6 s | The authored Weiguang RaisedHandWave, based on Warudo `AGIA_Other_wave_arm_01`, with its standard happy expression. |
| StarLiteSleepyStartle | 5.5 s | Authored by StarCried for StarLite; optional standard blink. |

The user approved redistribution of selected source motions on 2026-10-10 and
bundling these three gestures for all imported humanoids on 2026-10-31. This
records that distribution confirmation, not a claim that Warudo's whole library
is freely redistributable or that HappyWave is entirely original. Character
licenses do not apply to or confer rights over the source motion library.

`BUNDLED_MOTIONS.json` records source and final clip hashes. The gesture data
is losslessly deflated inside the runtime, without fetching external files.
Run `node tools/embed-builtin-motions.mjs <reviewed VRMA directory>` to regenerate
the embedded data from files matching those hashes. Tests inflate each clip,
verify hashes, reject artwork/custom expression channels, and retarget through
the official loader on synthetic VRM 0 and VRM 1 humanoids.

Only upper-body/finger rotations are animated; hips, legs, eye bones and root
translations are not overridden. SleepyStartle uses the standard optional blink
expression; HappyWave uses optional standard happy. Missing optional fingers
or expression bindings do not prevent body animation playback.
HappyWave retains the existing authored 3.8 s RaisedHandWave performance and
happy curve, including secondary motion on the non-waving side. It does not
reconstruct the raw 0.6 s library loop. A 0.4 s entry and 0.4 s exit connect its
raised-arm pose to the program StarLiteIdle reference; no constant clearance
offset changes the active hand arc. Standard happy uses the target model's
own expression binding, so its facial appearance varies between models.
Runtime pose calibration follows the selected Idle without
rewriting model-authored or external clips. Model-specific clipping can still
require pose or motion adjustments.

Gestures are optional mappings. Adding them never changes an existing user's
state, click or ambient action selection.
