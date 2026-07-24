# Security policy

## Supported versions

Only the latest `0.1.0-alpha` source revision is currently supported. No npm
package or production deployment is published yet.

## Reporting

Do not attach private puppets, source art, credentials, deployment tokens, or
unredacted blog configuration to a public issue. Contact the maintainer
privately first and provide a minimal synthetic reproducer whenever possible.

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

Creator exports are untrusted input. The native pipeline bounds file size,
texture count and dimensions, node depth and count, parameter count, and decode
allocations. Keep the pipeline and browser runtime updated together; bypassing
inspection or publishing a model directly removes those guarantees.
