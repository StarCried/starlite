# Public model policy

The full StarCried character project remains private on Windows. It must not
enter this repository, package archives, upstream contributions, CI artifacts,
or a public blog deployment.

A blog puppet must be a separate Creator export with explicit publication
approval. The alpha profile accepts PNG/TGA source textures up to 8192 pixels
per dimension and 32 Mi pixels, resizes browser output to at most 4096 pixels
per dimension, and requires the prepared `.inp` to remain at or below 8 MiB.
Oversized or over-budget inputs may therefore be lossy; the manifest records
the original/final dimensions and every resize. BC7, model automation,
additive/non-`Forced` animations, unsupported node/blend types, and a Composite
used as a mask are blocking errors. MeshGroup, Camera, ColorBurn,
SimplePhysics, Cubic bindings, and validated model-authored `Forced` animations
are supported.

`inochi2d-blog` does not infer rights. The operator must review the exact source
hash and set both publication booleans. A model declaring redistribution as
prohibited is always blocked; required attribution must be provided.

Third-party puppets are local-only test inputs and remain ignored by Git. Record
their origin, exact source hash, license, and attribution in
`docs/validation.md`. Automated and packaged artifacts may contain only
synthetic artwork-free fixtures.
