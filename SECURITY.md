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

## Model files

Creator exports are untrusted input. The native pipeline bounds file size,
texture count and dimensions, node depth and count, parameter count, and decode
allocations. Keep the pipeline and browser runtime updated together; bypassing
inspection or publishing a model directly removes those guarantees.
