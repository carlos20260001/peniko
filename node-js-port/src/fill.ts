/**
 * The paint description for fills: an epaint-facing convenience layer.
 *
 * ## Status of this module
 *
 * It predates the restructure that brought the port back in line with peniko's
 * own module tree, and its `Brush`, `Fill` and `Style` names now collide with
 * the faithful ports in `brush.ts` and `style.ts`. It is therefore *not*
 * re-exported from `lib.ts`, and its own test is the only consumer. Keep it
 * while there is a caller; delete it when there is not.
 *
 * ## Colour types
 *
 * The port carries `color`'s own colour types now (`color/`), so a caller does
 * not need to reach for `@egui-node/ecolor` to name a colour. This module stays
 * generic over whatever the caller passes, which is what `SolidBrush.color`
 * being `unknown` means.
 */

/**
 * How a paint behaves outside its natural bounds.
 *
 * Only present because `Brush` carries it upstream; the glyph rasterizer never
 * reads it.
 */
export enum Extend {
  Pad = 'Pad',
  Repeat = 'Repeat',
  Reflect = 'Reflect',
}

/**
 * How the paint's source pixels map onto the filled geometry.
 *
 * Only present for the same reason as {@link Extend}.
 */
export enum WrapMode {
  Pad = 'Pad',
  Repeat = 'Repeat',
  Reflect = 'Reflect',
}

/** A `peniko` brush. Only the solid variant is reachable in this port. */
export type Brush = SolidBrush;

/**
 * A single solid colour, with no image or gradient source.
 *
 * This is the only brush `epaint` can ask `vello_cpu` to paint: glyph
 * coverage is a single alpha mask filled with one colour.
 */
export class SolidBrush {
  readonly color: unknown;

  constructor(color: unknown) {
    this.color = color;
  }
}

/**
 * How a shape is filled.
 *
 * Upstream `Fill` is an enum of solid, linear gradient, radial gradient, and
 * image variants. Only {@link Fill.solid} is reachable here; the others are
 * listed so a future port has to make a deliberate decision rather than
 * discover the absence at runtime.
 */
export type Fill = SolidFill;

export class SolidFill {
  readonly kind = 'solid' as const;
  readonly brush: SolidBrush;

  constructor(brush: SolidBrush) {
    this.brush = brush;
  }

  /** The solid colour, passed straight through. */
  color(): unknown {
    return this.brush.color;
  }
}

/**
 * A fill plus its painting state.
 *
 * Upstream `Style` also carries an alpha, blend mode, and anti-alias flag.
 * Only the parts the glyph rasterizer needs are represented; see the README.
 */
export class Style {
  readonly fill: Fill;

  constructor(fill: Fill) {
    this.fill = fill;
  }

  /** A style that paints one solid colour. */
  static solid(color: unknown): Style {
    return new Style(new SolidFill(new SolidBrush(color)));
  }
}

/**
 * Convenience constructor for the only fill this port supports.
 *
 * `peniko::Fill::solid(color)` upstream.
 */
export function solid(color: unknown): Style {
  return Style.solid(color);
}