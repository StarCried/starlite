# Public model policy

The full StarCried character project remains private on Windows. It must not
enter this repository, package archives, upstream contributions, CI artifacts,
or a public blog deployment.

An independently licensed example VRM is separate from the BSD-licensed code.
Only expressly approved derived assets may be distributed under the model's own
license; it never grants rights to the private source project or third-party
motions. Public blog delivery must be an expressly permitted use, since visitors
receive the files needed to render the character. Restrictions on re-use cannot
technically prevent downloading those files.

An Inochi2D blog puppet must be a separate Creator export with explicit publication
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

## VRM and external animation assets

The private-asset boundary also applies to VRM models, textures, character
profiles and every external VRMA motion. A character author's permission does
not grant rights to a third-party animation library. Retargeting, trimming,
repeating or baking a motion does not establish permission to distribute it.
Record the origin, file hashes, applicable permission and required attribution
for each source, including breathing layers mixed into another clip.

VRM bundle `publication.allowRedistribution` and the Hexo publication
attestations concern all distributed assets. `publication.sourceSha256` binds
the reviewed model bytes; it neither identifies the animation licenses nor
proves their approval. Review motions, textures, profiles and fallback content
again when they change, even if the source model digest stays the same.

The direct Hexo VRM file path validates and hashes the exact model bytes;
advanced prepared directories also validate declared motion and profile hashes.
Both public VRM paths limit the model to 10 MiB. Public browser use delivers the asset
files to visitors; permission must cover that use. The isolated local-preview
capability is not a rights attestation, and technical validation of an import
does not establish its permitted use.
