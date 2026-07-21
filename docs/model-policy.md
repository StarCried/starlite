# Public model policy

The full StarCried model remains a private Windows-side asset and must not enter
this repository, upstream contributions, automated tests, package archives, or
deployment artifacts.

A future public blog puppet must be a separate Creator export with explicit
publication approval. It should use PNG or TGA textures, avoid BC7, MeshGroup,
built-in animation, and composite-as-mask, target a 2048 atlas (never exceeding
4096 per texture), and remain under 8 MiB. The intended parameter contract is:

`HeadX`, `HeadY`, `HeadZ`, `BodyX`, `BodyY`, `EyeOpenL`, `EyeOpenR`, `EyeX`,
`EyeY`, `BrowL`, `BrowR`, `MouthOpen`, `MouthForm`, and `Breath`.

Third-party models may be used only for local manual testing after their source,
license, and attribution have been recorded. They remain ignored by Git.
