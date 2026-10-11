# Node.js port: `peniko` replacement

TypeScript port of [`peniko`](https://github.com/linebender/peniko) and of its
colour dependency, [`color`](https://crates.io/crates/color), for the subset
`egui` depends on.

## Why

`peniko` is `vello_cpu`'s paint layer: fills, strokes, brushes, gradients and
blend modes. `epaint` only ever uses one of these — **a plain solid fill** of a
glyph outline — but the *types* it names have to be the real ones, because vello
composites in **premultiplied linear-light sRGB** and every blend, gradient and
antialiased edge depends on that.

Note that `peniko` re-exports `kurbo` for path geometry. That is convenient
upstream but not needed in the port: path construction lives in `epaint` and
`emath` already (`emath::Vec2`/`Rect`/`Rot2`).

## Upstream reference

- Crate: `peniko` (its own repo, also vendored inside `linebender/vello`).
- Version egui pins: `0.6.1`.
- Colour crate: `color` 0.3.3, vendored at `../color/`.
- Licence: `Apache-2.0 OR MIT` — identical to egui's own dual licence.

## Layout

The module tree mirrors the crates', so a ported file can be diffed against the
Rust it came from:

| Rust module | Port | Notes |
|---|---|---|
| `peniko/src/lib.rs` | `src/lib.ts` | crate root, re-exports |
| `peniko/src/{blend,brush,gradient,image,style,blurred_rounded_rect}.rs` | `src/{blend,brush,gradient,image,style,blurred_rounded_rect}.ts` | |
| `color/src/{colorspace,color,rgba8,chromaticity,tag,floatfuncs}.rs` | `src/color/{colorspace,color,rgba8,chromaticity,tag,floatfuncs}.ts` | |
| `color/src/{cache_key,dynamic,flags,gradient,parse,serialize,impl_bytemuck}.rs`, `palette/`, `x11_colors.rs` | same names, note-only | see each file for why |
| — | `src/compose.ts` | vello's `fine::highp` blend/compose arithmetic |
| — | `src/fill.ts` | an earlier iteration's convenience layer; see its header |

Floating point is `f64` here and `f32` upstream, so results agree to about seven
significant digits rather than bit for bit. The one place that is observable is
quantization to `u8`, where a value upstream lands on exactly can come out one
off.

## What the colour port covers

- The sRGB transfer functions (`srgb_to_lin`, `lin_to_srgb`), including the
  `copysign` sign handling for negative inputs.
- `ColorSpace` with the `Srgb` and `LinearSrgb` descriptors, colour-space
  conversion, and the Bradford chromatic-adaptation matrices.
- `OpaqueColor`, `AlphaColor` and `PremulColor`, with premultiplication,
  un-premultiplication, `convert`, `multiply_alpha`, `map` and `to_rgba8`.
- `Rgba8` and `PremulRgba8`, including the u8 round trip.

Not ported: the dynamic (runtime-tagged) colour type and the CSS parser that
produces it, the interpolation iterators, the named-colour tables, and the
bytemuck/serde derives. Each carries a note in place.

## Licence

This port is `MIT OR Apache-2.0`, matching the upstream crates.
