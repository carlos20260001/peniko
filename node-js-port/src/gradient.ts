/**
 * A TypeScript port of `peniko`'s `gradient.rs`.
 *
 * Upstream, a stop's colour is a `DynamicColor` — a colour whose space is known
 * only at runtime, because a gradient may interpolate in any of them. This port
 * has no `DynamicColor` (see `color/dynamic.ts`), so a stop carries a `Color`:
 * an `AlphaColor<Srgb>`, which is what a caller has in hand. The interpolation
 * space itself is still a `ColorSpaceTag`, so a gradient can ask for linear
 * sRGB and get it.
 *
 * `ColorStops` and `ColorStopsSource` are absent: they wrap a `SmallVec` and a
 * trait over every collection that could produce stops. A plain `readonly
 * ColorStop[]` is the same thing here, and `with_stops` takes it directly.
 */

import type { AlphaColor } from './color/color.js';
import type { Srgb } from './color/colorspace.js';
import { HueDirection } from './color/color.js';
import { ColorSpaceTag } from './color/tag.js';
import { Extend } from './brush.js';

/**
 * Defines how colour channels should be handled when interpolating between
 * transparent colours, as peniko's `InterpolationAlphaSpace`.
 */
export enum InterpolationAlphaSpace {
  /**
   * Colours are interpolated with their colour channels premultiplied by the
   * alpha channel. This is almost always what you want.
   */
  Premultiplied = 0,
  /**
   * Colours are interpolated without premultiplying their colour channels by
   * the alpha channel. This causes colour information to leak out of
   * transparent colours.
   */
  Unpremultiplied = 1,
}

/** Offset and colour of a transition point in a {@link Gradient}, as `ColorStop`. */
export class ColorStop {
  constructor(
    /** Normalized offset of the stop. */
    readonly offset: number,
    /** Colour at the specified offset. */
    readonly color: AlphaColor<Srgb>,
  ) {}

  /** Returns the colour stop with the alpha component set to `alpha`. */
  with_alpha(alpha: number): ColorStop {
    return new ColorStop(this.offset, this.color.with_alpha(alpha));
  }

  /** Returns the colour stop with the alpha component multiplied by `alpha`. */
  multiply_alpha(alpha: number): ColorStop {
    return new ColorStop(this.offset, this.color.multiply_alpha(alpha));
  }
}

/** Parameters that define the position of a linear gradient. */
export interface LinearGradientPosition {
  /** Starting point. */
  readonly start_x: number;
  /** Starting point. */
  readonly start_y: number;
  /** Ending point. */
  readonly end_x: number;
  /** Ending point. */
  readonly end_y: number;
}

/** Parameters that define the position of a radial gradient. */
export interface RadialGradientPosition {
  /** Centre of the start circle. */
  readonly start_x: number;
  readonly start_y: number;
  /** Radius of the start circle. */
  readonly start_radius: number;
  /** Centre of the end circle. */
  readonly end_x: number;
  readonly end_y: number;
  /** Radius of the end circle. */
  readonly end_radius: number;
}

/** Parameters that define the position of a sweep gradient. */
export interface SweepGradientPosition {
  /** Centre point. */
  readonly center_x: number;
  readonly center_y: number;
  /** Start angle of the sweep in radians, measuring from the positive X-axis. */
  readonly start_angle: number;
  /** End angle of the sweep in radians, measuring from the positive X-axis. */
  readonly end_angle: number;
}

/** Properties for the supported {@link Gradient} types, as `GradientKind`. */
export type GradientKind =
  | { readonly kind: 'linear'; readonly position: LinearGradientPosition }
  | { readonly kind: 'radial'; readonly position: RadialGradientPosition }
  | { readonly kind: 'sweep'; readonly position: SweepGradientPosition };

/**
 * Definition of a gradient that transitions between two or more colours.
 *
 * The port keeps the fields flat rather than modelling the builder's storage,
 * because the builder's methods have one-to-one field equivalents.
 */
export class Gradient {
  constructor(
    readonly kind: GradientKind,
    readonly stops: readonly ColorStop[],
    readonly extend: Extend = Extend.Pad,
    /** The colour space to be used for interpolation. */
    readonly interpolation_cs: ColorSpaceTag = ColorSpaceTag.Srgb,
    /** When interpolating within a cylindrical space, the direction for the hue. */
    readonly hue_direction: HueDirection = HueDirection.Shorter,
    /** Alpha space to be used for interpolation. */
    readonly interpolation_alpha_space: InterpolationAlphaSpace =
      InterpolationAlphaSpace.Premultiplied,
  ) {}

  /** Builder method for setting the gradient extend mode. */
  with_extend(mode: Extend): Gradient {
    return new Gradient(
      this.kind,
      this.stops,
      mode,
      this.interpolation_cs,
      this.hue_direction,
      this.interpolation_alpha_space,
    );
  }

  /** Builder method for setting the interpolation colour space. */
  with_interpolation_cs(interpolation_cs: ColorSpaceTag): Gradient {
    return new Gradient(
      this.kind,
      this.stops,
      this.extend,
      interpolation_cs,
      this.hue_direction,
      this.interpolation_alpha_space,
    );
  }

  /** Builder method for setting the interpolation alpha space. */
  with_interpolation_alpha_space(interpolation_alpha_space: InterpolationAlphaSpace): Gradient {
    return new Gradient(
      this.kind,
      this.stops,
      this.extend,
      this.interpolation_cs,
      this.hue_direction,
      interpolation_alpha_space,
    );
  }

  /** Builder method for setting the hue direction. */
  with_hue_direction(hue_direction: HueDirection): Gradient {
    return new Gradient(
      this.kind,
      this.stops,
      this.extend,
      this.interpolation_cs,
      hue_direction,
      this.interpolation_alpha_space,
    );
  }

  /** Builder method for setting the colour stop collection. */
  with_stops(stops: readonly ColorStop[]): Gradient {
    return new Gradient(
      this.kind,
      stops,
      this.extend,
      this.interpolation_cs,
      this.hue_direction,
      this.interpolation_alpha_space,
    );
  }

  /** Returns the gradient with the alpha component for all colour stops set to `alpha`. */
  with_alpha(alpha: number): Gradient {
    return this.with_stops(this.stops.map((stop) => stop.with_alpha(alpha)));
  }

  /** Returns the gradient with the alpha component for all stops multiplied by `alpha`. */
  multiply_alpha(alpha: number): Gradient {
    return this.with_stops(this.stops.map((stop) => stop.multiply_alpha(alpha)));
  }
}
