# Security policy

## Supported versions

Only the latest published alpha receives security fixes. Published npm packages
and release assets are listed in [the release guide](docs/release-guide.md).
Unpublished local candidates are not updates to those packages. The supported
browser target is desktop Chrome/Edge with WebGL2; Hexo support is version 7.

## Reporting

Do not attach private puppets, source art, credentials, deployment tokens, or
unredacted blog configuration to a public issue. As checked on 2026-10-19,
GitHub private vulnerability reporting is not enabled on this repository.
Open a minimal issue requesting a private contact channel, without exploit
details or sensitive attachments; send the reproducer only after a private
channel is agreed. Ordinary public-safe bugs can use the issue forms.

The deployment command is intentionally fail-closed. A failed rights check,
source hash, model build, Hexo generation, browser gate, or native-binary
integrity check must prevent `hexo deploy`. Reports that show a path around one
of these gates are treated as security issues.

## Unsigned native alpha

`inochi2d-blog` currently bundles unsigned experimental Windows/Linux x64
pipeline binaries. npm installation does not execute them. Explicit CLI use
verifies the packaged byte length and SHA-256 first, but a hash is an integrity
check rather than publisher identity or a security review.

Do not disable Smart App Control, antivirus, application control, or endpoint
policy for this tool. If execution is blocked, stop or build the Rust pipeline
from reviewed source and select it with `pipelineBinary`. A start failure is
fatal and no later Hexo generation or deploy command runs.

## Model files

VRM, VRMA and Creator exports are untrusted input. Inspectors bound file size,
texture count and dimensions, node depth and count, parameter count, and decode
allocations. Keep the pipeline and browser runtime updated together; bypassing
inspection or publishing a model directly removes those guarantees. VRM files
must contain their buffers and textures; external references are rejected.
Optional blink/lookAt capability reports describe usable bindings, not an
artistic or licensing review. Model and animation licenses remain separate
from the BSD program license.

Dependency scan results, review policy and unresolved upstream findings are
recorded in [dependency auditing](docs/dependency-audit.md). A clean bundle-size
or rendering check is not a security audit.
