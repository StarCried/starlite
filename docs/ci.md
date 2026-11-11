# Continuous integration

The workflow files under [`.github/workflows`](../.github/workflows) define tool versions, jobs and permissions. Keep those values there rather than duplicating them in this guide.

- Pull requests and `main` pushes run checks appropriate to the changed files. Documentation-only changes retain a reporting check without rebuilding native installers. Product, dependency, toolchain and workflow changes run the relevant full checks.
- Dependency audits and browser checks retain their own evidence. An optional private-model fixture skip is not a successful model acceptance test.
- Release preparation builds reviewed source, checks the packages and saves the candidate artifacts. Publication uses those same artifacts after approval; see [releasing](releasing.md) for the workflow and one-time npm trust setup.

The SDK build validates pinned source/toolchain/output hashes. License inventory and package-content checks catch missing notices and accidental model inclusion. Native artifacts are unsigned; hashes establish byte integrity, not publisher identity.

CI success, a locally prepared candidate and a publicly verified release are distinct results. Generated reports preserve that distinction. Site deployment remains a separate operation.
