# Node.js port: `peniko` replacement

TypeScript replacement for [`peniko`](https://github.com/linebender/peniko),
for the subset `egui` depends on.

## Why

`peniko` is `vello_cpu`'s paint layer: fills, strokes, brushes, gradients and
blend modes. `epaint` only ever uses one of these — **a plain solid fill** of a
glyph outline. Everything else (gradients, image brushes, blend modes,
`BlurredRoundedRect`) is vector-graphics API surface that the headless port
does not reproduce.

Note that `peniko` re-exports `kurbo` for path geometry. That is convenient
upstream but not needed in the port: path construction lives in `epaint` and
`emath` already (`emath::Vec2`/`Rect`/`Rot2`).

## Upstream reference

- Crate: `peniko` (its own repo, also vendored inside `linebender/vello`).
- Version egui pins: `0.6.1`.
- Licence: `Apache-2.0 OR MIT` — identical to egui's own dual licence.

## Modules to port

| Rust module | Purpose | TS status |
|---|---|---|
| `style.rs` (`Fill`, `Style`) | fill description; only the solid case is needed | TODO |
| `color` | premultiplied linear RGBA, colour-space conversion | TODO |

Not ported: `blend.rs` (`BlendMode`, `Compose`, `Mix`), `gradient.rs`,
`image.rs`, `brush.rs`, `blurred_rounded_rect.rs`.

## Dependencies

None. The colour types should reuse `@egui-node/ecolor` (`Color32`, `Rgba`)
rather than duplicating them, so the port and `epaint` share one colour
implementation.

## Licence

This port is `MIT OR Apache-2.0`, matching the upstream crate.