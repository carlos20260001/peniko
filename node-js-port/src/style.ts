/**
 * A TypeScript port of `peniko`'s `style.rs`.
 *
 * Upstream, `Style` is a fill-or-stroke enum: it says *how* a path is turned
 * into coverage, and it deliberately does not carry a colour. The stroke
 * variant needs `kurbo::Stroke`, which this port does not have — path
 * construction lives in `emath` and `epaint` — so this module ports the fill
 * rule and the `Style` wrapper, and leaves `Style::Stroke` out with the note
 * that adding it means porting `Stroke` alongside.
 *
 * `StyleRef` is absent for the same reason `BrushRef` is: it exists upstream to
 * let a caller pass a borrow without moving, and a TypeScript reference is
 * already free.
 */

/**
 * Describes the rule that determines the interior portion of a shape.
 *
 * This is only relevant for self-intersecting paths (e.g. an hourglass shape).
 * For non-self-intersecting paths, both rules produce the same result.
 */
export enum Fill {
  /**
   * Non-zero fill rule.
   *
   * All regions where the winding number of the path is not zero will be filled.
   * This is generally more correct, but can be more expensive to implement in
   * renderers.
   */
  NonZero = 0,
  /**
   * Even-odd fill rule.
   *
   * All regions where the winding number is odd will be filled. The most common
   * use case for this rule is as an optimisation when the paths are known not to
   * be self-intersecting. It is also useful for creating intentional holes in
   * self-intersecting shapes (e.g. star or donut-like paths) or to match the
   * SVG/Canvas even-odd fill rule.
   */
  EvenOdd = 1,
}

/** Describes draw style — either a {@link Fill} or a stroke. */
export class Style {
  private constructor(readonly fill: Fill) {}

  /** Filled draw operation. */
  static filled(fill: Fill): Style {
    return new Style(fill);
  }

  /** The default draw style: the non-zero fill rule. */
  static readonly DEFAULT: Style = new Style(Fill.NonZero);
}
