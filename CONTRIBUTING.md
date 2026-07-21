# Contributing

## Before changing code

1. Keep Rust model/rendering concerns separate from browser and Hexo concerns.
2. Confirm that any test puppet is synthetic or explicitly redistributable.
3. Discuss changes to the public API, compatibility targets, dependencies, or
   deployment behavior before implementing them.

## Validation

Run the narrow test for the code being changed, then:

```sh
npm run validate
npm run test:browser
git diff --check
```

Real-browser checks on Windows Chrome and Edge remain required before a release.
Record failures as either introduced by the change or already present upstream.

## Upstream work

Changes intended for Inox2D belong in the sibling `inox2d` checkout. Keep them
small, avoid duplicating active pull requests, and obtain approval before opening
an issue or pull request.
