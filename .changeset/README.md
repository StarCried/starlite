# Changesets

For a user-visible package change, run `npm run changeset` and write a short
description of the resulting behavior. Documentation and release tooling alone
do not require a package bump.

Core, Inochi2D, VRM and Hexo form one fixed release group. `inochi2d-blog` remains
independent. Use `npm run release -- version` to consume changesets and sync the
root/examples and lockfile. Review and commit the resulting diff before preparing
artifacts. Publishing uses the reviewed tarballs, not `changeset publish`.

See [the release workflow](../docs/releasing.md).
