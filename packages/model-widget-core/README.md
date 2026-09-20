# Model widget core

Format-independent controller contract, bounded asset fetch and cancellable mount ownership.
Hosts choose a backend before importing its runtime. The core never imports Three.js or Inochi2D WASM.
`ModelMountSlot` aborts replaced work and destroys late results. Animation payloads and rig parameters belong to their backend.

`DialogueScheduler` owns enter/idle/click timing. `DialogueBubble` owns safe text,
ARIA status announcements, screen-edge placement, expiry, and timer cleanup.
Both renderers use this presenter and ship the same CSS in their existing
`widget.css`; hosts need no additional stylesheet. Configure each dialogue scene
explicitly with an available animation and text lines. DSH state text and privacy
selection remain application responsibilities and are already backend-neutral.
The shared bubble selector is `.model-widget__bubble`, with `data-model-scene`
and `data-model-placement` attributes.
