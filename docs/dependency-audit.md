# Dependency maintenance

Run the online dependency gate before a release:

```sh
npm ci
rustup toolchain install stable --profile minimal
cargo +stable install cargo-audit --version 0.22.2 --locked
npm run check:dependencies
```

Only the scanner is built with the newer stable toolchain; the native pipeline
remains pinned to Rust 1.85 by `rust-toolchain.toml`.

`npm run test:dependency-audit` tests the gate without network requests and is
included in `npm test`. The separate `Dependency audit` workflow runs on every
pull request, main push, Monday, and manual dispatch. It installs the pinned
RustSec scanner, queries the registry and advisory database, and retains reports
under `target/dependency-audit` as a 14-day workflow artifact. No model files,
tokens, scanner stderr, or desktop input are collected.

The gate scans the complete npm and Cargo lockfiles. It does not use a severity
threshold, `cargo audit --ignore`, a target filter, or a stale/offline database
fallback. New advisories, changed affected versions or paths, new Rust warnings,
expired exceptions, scanner/network failures, and incomplete reports fail the
check. A green result can include the explicitly listed temporary findings below;
the summary preserves their identities and affected package count.

## Reviewed baseline: 2026-10-19

| Scan | Result |
| --- | --- |
| `npm audit --json` | 9 affected package entries, tracing to 2 upstream advisories |
| Cargo.lock, cargo-audit 0.22.2 | 57 dependencies, no vulnerability entries or informational warnings |

The npm findings belong to the Hexo 7.3.0 host/example dependency graph. They
are not included in the framework-free `core` or browser VRM renderer bundles.
Hexo users still execute this host dependency code when building or previewing
their sites; the findings are not dismissed as development-only.

| Advisory | Installed root package | Scope and decision |
| --- | --- | --- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces 3.0.3 | Stack exhaustion from deeply nested patterns, reached through Hexo glob/watch dependencies. Upstream lists no patched version. Temporary exception for trusted local blog configuration and source trees. |
| [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) | sprintf-js 1.1.3 | Denial of service from unbounded precision in controlled format strings, through hexo-i18n. Upstream lists no patched version. Templates and translation format strings must remain trusted. |

Both decisions must be reviewed by **2026-11-18**. The machine-readable policy
in `tools/dependency-audit-policy.json` pins the advisory ID, reported range,
severity, all 9 affected package versions, and their exact lockfile paths. It
does not permit another advisory on the same package or another dependency copy.
The raw npm report remains visible; these are accepted temporary risks, not fixed
vulnerabilities. Do not run untrusted themes, configuration, or build inputs.

The registry's automatic suggestion currently selects Hexo 3.9.0. Downgrading
the supported Hexo 7 host to bypass an audit is not an acceptable fix. Do not run
`npm audit fix --force`. When compatible upstream fixes become available, update
the dependency chain, rerun full tests and real packed installation checks, then
remove the obsolete exception. A dependency/version change deliberately forces
review instead of silently extending the old exception.

## Maintaining a decision

Read the primary advisory and inspect the actual dependency path before changing
the policy. Record the specific exposure, why a compatible fix cannot yet be
used, and a short review deadline. Never allow an entire package family, severity
class, or warning kind. Rust vulnerabilities have no exceptions in this gate.
If the registry or RustSec service is unavailable, rerun after it recovers;
do not report the previous scan as a current pass.
