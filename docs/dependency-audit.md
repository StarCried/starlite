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

## Reviewed baseline: 2026-10-31

| Scan | Result |
| --- | --- |
| `npm audit --json` | 6 low-severity affected package entries, tracing to 1 upstream advisory |
| Cargo.lock, cargo-audit 0.22.2 | 57 dependencies, no vulnerability entries or informational warnings |

Happy DOM is updated to 21.0.4, including the upstream fix for
[the ESM import-alias code-execution issue](https://github.com/advisories/GHSA-834v-8h66-3h79).
It is used by the test harness, not shipped as a browser runtime. DOMPurify in
the Hexo renderer dependency chain is updated to 3.4.17, including
[the shadow-root template-sanitization fix](https://github.com/advisories/GHSA-cg2g-xh64-v4q7).
The lockfile records the resolved versions; no automatic force downgrade or
unreviewed replacement package is used.

The complete online gate passed against RustSec database
`2295466c4e9df26647fd67d8fa1c705ac2fc7f81`. Raw findings and the decision
summary are retained in the ignored `target/dependency-audit/` directory.

### Unpatched Hexo host finding

[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
reports returned-object prototype poisoning in deepmerge 4.2.0 through 4.3.1.
GitHub reviewed it as **low** severity on 2026-10-27 and lists **no patched
version**. This is a temporary accepted risk, not a fixed vulnerability or a
zero-vulnerability audit.

The installed call path is `Hexo 7.3.0 -> hexo-util 3.3.0 -> deepmerge 4.3.1`.
Inspection of the installed Hexo code found `deepMerge` calls in configuration
loading, multi-configuration merging, theme configuration and post scaffold
creation. Inputs include local `_config.yml`/JSON, theme configuration,
scaffolds and post-creation data. The
[upstream report](https://github.com/TehShrike/deepmerge/issues/273) describes
inherited properties on returned objects, including targets with null
prototypes or certain placeholder values; it does not require global
`Object.prototype` mutation.

This project supports trusted local blog authoring. Do not pass untrusted
configuration, themes, scaffolds or post-creation data into the Hexo build.
A hosted service that accepts those inputs would need a separate security
review; this exception does not cover that use. The dependency is absent from
StarLite's browser core/VRM bundles and from DSH, but Hexo users execute it
while building or previewing sites, so it is not dismissed as development-only.

The temporary exception covers only these installed paths and versions, all
reported at low severity under this one advisory:

| Package | Version | Lockfile path |
| --- | --- | --- |
| deepmerge | 4.3.1 | `node_modules/deepmerge` |
| hexo | 7.3.0 | `node_modules/hexo` |
| hexo-cli | 4.3.2 | `node_modules/hexo-cli` |
| hexo-fs | 4.1.3 | `node_modules/hexo-fs` |
| hexo-renderer-marked | 7.0.1 | `node_modules/hexo-renderer-marked` |
| hexo-util | 3.3.0 | `node_modules/hexo-util` |

Review this decision by **2026-11-18**. The machine-readable policy pins the
advisory ID, affected range, severity, all six versions and exact paths. Another
advisory, nested copy, version or severity change still fails the gate. The
original npm report and accepted advisory remain visible in its summary.

The registry currently suggests downgrading Hexo to 4.0.0 or
hexo-renderer-marked to 2.0.0. These are not compatible fixes for the supported
Hexo 7 host. Do not run `npm audit fix --force`, vendor an unreviewed patch, or
raise the severity threshold. When a compatible upstream fix becomes
available, update the dependency chain, rerun tests and packed-install checks,
and remove the obsolete exception.

### Retired findings

The previous exceptions for
[braces / GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
and
[sprintf-js / GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
have been removed. GitHub withdrew those advisories on 2026-10-23 and
2026-10-22 respectively, and the fresh registry report no longer lists them.
This is an upstream advisory correction, not a claim that their package code
was patched here. A later new or reinstated advisory must be reviewed again.

## Maintaining a decision

Read the primary advisory and inspect the actual dependency path before changing
the policy. Record the specific exposure, why a compatible fix cannot yet be
used, and a short review deadline. Never allow an entire package family, severity
class, or warning kind. Rust vulnerabilities have no exceptions in this gate.
If the registry or RustSec service is unavailable, rerun after it recovers;
do not report the previous scan as a current pass.
