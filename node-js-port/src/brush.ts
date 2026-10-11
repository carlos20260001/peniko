/**
 * A TypeScript port of `peniko`'s `brush.rs` — the `Brush` enum and `Extend`.
 *
 * Two deviations from upstream, both inherited from the port's existing shape:
 *
 * 1. Upstream `Brush<I, G>` is generic over the image and gradient types and
 *    carries `AlphaColor<Srgb>` for the solid case. The port keeps one generic
 *    parameter, over the colour, defaulted to that same `AlphaColor<Srgb>`, so a
 *    backend with a different colour representation still has somewhere to put
 *    it.
 * 2. `BrushRef` and `ImageBrushRef` are absent. They exist upstream to let a
 *    caller pass `&Gradient` without cloning; TypeScript references are already
 *    free, and `T | undefined` covers the same call sites.
 */

import type { AlphaColor } from './color/color.js';
import type { Srgb } from './color/colorspace.js';
import type { Gradient } from './gradient.js';
import type { ImageBrush } from './image.js';

/** Defines how a brush is extended when the content does not fill a shape. */
export enum Extend {
  /** Extends the image by repeating the edge colour of the brush. */
  Pad = 0,
  /** Extends the image by repeating the brush. */
  Repeat = 1,
  /** Extends the image by reflecting the brush. */
  Reflect = 2,
}

/**
 * Describes the colour content of a filled or stroked shape.
 *
 * A discriminated union rather than upstream's enum, so the renderer can switch
 * on it directly.
 */
export type Brush<C = AlphaColor<Srgb>> =
  | { readonly kind: 'solid'; readonly color: C }
  | { readonly kind: 'gradient'; readonly gradient: Gradient }
  | { readonly kind: 'image'; readonly image: ImageBrush };

/** Convenience constructor for a solid brush. */
export function solidBrush<C>(color: C): Brush<C> {
  return { kind: 'solid', color };
}

/** Convenience constructor for a gradient brush. */
export function gradientBrush<C>(gradient: Gradient): Brush<C> {
  return { kind: 'gradient', gradient };
}

/** Convenience constructor for an image brush. */
export function imageBrush<C>(image: ImageBrush): Brush<C> {
  return { kind: 'image', image };
}
