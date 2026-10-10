/**
 * `peniko` replacement: the paint description for fills.
 *
 * ## Why this is small
 *
 * `peniko` is `vello_cpu`'s paint layer, and upstream it offers a lot:
 * gradients, image brushes, blend modes, blur, and `BlurredRoundedRect`.
 *
 * Almost none of that is reachable in this port. `epaint` does its own shape
 * tessellation in `epaint/src/tessellator.rs`; it only reaches `vello_cpu` to
 * rasterize glyphs into the font atlas, and that is always a single solid
 * fill. So the "paint description" here is genuinely one variant.
 *
 * ## Colour types
 *
 * Colour types are **not** redefined here. `peniko` re-exports its own
 * `color` module, but the port shares `@egui-node/ecolor` with `epaint` so
 * there is exactly one colour implementation across the pipeline. `SolidFill`
 * is generic over the colour type for that reason.
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