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
Long sentences keep their visible prefix within three lines and show an ellipsis
at overflow. Text fades in on a new scene and respects reduced-motion settings.

Dialogue scenes accept an optional `animations: ["Wave", "Nod"]` pool beside
their existing `animation` and `lines`. Each trigger independently chooses one
clip and one sentence. Both backends validate every exact clip name; pools have
1–20 distinct entries. Omit the pool to retain the single-clip behavior.

Desktop hosts can opt into `observeInteractionMask(listener)`. Both renderers
sample only the model canvas immediately after a rendered frame, at most 20 Hz;
no alpha readback runs unless a listener is installed. Coverage is packed into
bits, normally at two CSS pixels per sample, with a bounded 512 × 512 grid.
Transparent texture holes and backgrounds remain empty; bubbles are excluded.
Pausing retains the last visible silhouette; failed rendering and destruction
clear it. Native hosts must handle window-level mouse passthrough themselves.
`setPointerPosition(x, y)` accepts finite viewport-relative CSS coordinates,
including points outside the window, for bounded global desktop gaze tracking.
