/**
 * A TypeScript port of `peniko`'s `blurred_rounded_rect.rs`.
 *
 * Upstream the rectangle is a `kurbo::Rect`; the port spells out the origin and
 * size, which is the same rectangle without the dependency on kurbo.
 */

import type { AlphaColor } from './color/color.js';
import type { Srgb } from './color/colorspace.js';

/**
 * A blurred, rounded rectangle.
 *
 * May be used in renderer APIs, as a fast path to render shadows for rounded
 * rectangles.
 */
export interface BlurredRoundedRect {
  /** Left edge of the base rectangle. */
  readonly x: number;
  /** Top edge of the base rectangle. */
  readonly y: number;
  /** Width of the base rectangle. */
  readonly width: number;
  /** Height of the base rectangle. */
  readonly height: number;
  /** The colour of the blurred rectangle. */
  readonly color: AlphaColor<Srgb>;
  /** The radius of the rounded rectangle's corners. */
  readonly radius: number;
  /** The standard deviation of the blur effect. */
  readonly std_dev: number;
}
