# Synthetic fixture

`synthetic-puppet.json` defines an intentionally empty Inochi2D puppet with a
root node and the public parameter contract, but no textures, mesh, or artwork.
It is covered by this repository's BSD-2-Clause license.

`tools/generate-synthetic-fixtures.mjs` wraps the JSON in the documented INP
container headers with a zero-texture section. Generated `.inp` files are ignored
and used only by Rust parsing tests and local browser/Hexo smoke tests.
