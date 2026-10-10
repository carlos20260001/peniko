/**
 * A TypeScript port of `peniko`, minus its colour types.
 *
 * `peniko` is vello's paint layer. It defines *what* to paint (solid colour,
 * gradient, image) and *how* it combines with what is already there (a
 * `BlendMode` of one CSS `mix-blend-mode` and one `background-blend-mode`).
 * The arithmetic those modes imply lives in vello's `compose` stage, not here;
 * this module is the definition and the data, which is what the rest of the
 * port needs.
 *
 * ## Colour
 *
 * `peniko` ships `color.rs` with `AlphaColor<Srgb>`, `HueDirection` and
 * conversion between colour spaces. That is a large subsystem that would
 * duplicate `@egui-node/ecolor-ts`, so the port keeps `Brush` generic over the
 * caller's colour type and lets `ecolor` supply it. This is the one deliberate
 * deviation from upstream's shape.
 */

type Color = number;

/**
 * A CSS `mix-blend-mode`, as `peniko::Mix`.
 *
 * The discriminants are upstream's `#[repr(u8)]` values, so a numeric encoding
 * round-trips — which matters because vello encodes them into its command
 * stream and GPU buffers.
 */
export enum Mix {
  Normal = 0,
  Multiply = 1,
  Screen = 2,
  Overlay = 3,
  Darken = 4,
  Lighten = 5,
  ColorDodge = 6,
  ColorBurn = 7,
  HardLight = 8,
  SoftLight = 9,
  Difference = 10,
  Exclusion = 11,
  Hue = 12,
  Saturation = 13,
  Color = 14,
  Luminosity = 15,
}

/** A CSS `background-blend-mode`, as `peniko::Compose`. */
export enum Compose {
  Clear = 0,
  Copy = 1,
  Dest = 2,
  SrcOver = 3,
  DestOver = 4,
  SrcIn = 5,
  DestIn = 6,
  SrcOut = 7,
  DestOut = 8,
  SrcAtop = 9,
  DestAtop = 10,
  Xor = 11,
  Plus = 12,
  PlusLighter = 13,
}

/**
 * How a paint combines with what is beneath it.
 *
 * `mix` is the blend of the paint's colour, `compose` is how the resulting
 * alpha commingles. Upstream defaults both to the "normal, src-over" that draws
 * opaque paint directly.
 */
export class BlendMode {
  constructor(
    readonly mix: Mix = Mix.Normal,
    readonly compose: Compose = Compose.SrcOver,
  ) {}

  /** Whether the mode discards the destination entirely. */
  isDestructive(): boolean {
    return this.compose === Compose.Clear || this.compose === Compose.Copy || this.compose === Compose.SrcOut;
  }

  /** The default: normal mixing, source over. */
  static readonly DEFAULT = new BlendMode();
}

/** How a gradient continues past its last stop, as peniko's `Extend`. */
export enum Extend {
  Pad = 'pad',
  Repeat = 'repeat',
  Reflect = 'reflect',
}

/** RGB interpolation in straight or premultiplied space, as peniko's `InterpolationAlphaSpace`. */
export enum InterpolationAlphaSpace {
  Srgb = 'srgb',
  LinearSrgb = 'linear-srgb',
  LinearSrgbPremul = 'linear-srgb-premul',
  Oklab = 'oklab',
  OklabPremul = 'oklab-premul',
}

/** A gradient stop, as peniko's `GradientStop`. */
export interface GradientStop {
  readonly offset: number;
  readonly color: Color;
}

/** A linear gradient's endpoints, as `LinearGradientPosition`. */
export interface LinearGradientPosition {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

/** A radial gradient's centre, radius and focal point, as `RadialGradientPosition`. */
export interface RadialGradientPosition {
  readonly startX: number;
  readonly startY: number;
  readonly startRadius: number;
  readonly endX: number;
  readonly endY: number;
  readonly endRadius: number;
}

/** A sweep gradient's centre and angle range, as `SweepGradientPosition`. */
export interface SweepGradientPosition {
  readonly centerX: number;
  readonly centerY: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

/** Which geometric form a gradient takes, as `GradientKind`. */
export type GradientKind =
  | { readonly kind: 'linear'; readonly position: LinearGradientPosition }
  | { readonly kind: 'radial'; readonly position: RadialGradientPosition }
  | { readonly kind: 'sweep'; readonly position: SweepGradientPosition };

/**
 * A gradient: a kind, stops, extend mode and interpolation space.
 *
 * The port keeps the fields flat rather than modelling a builder, because the
 * builder's methods (`with_stop`, `with_extend`) have one-to-one field
 * equivalents and call sites construct a gradient in one expression.
 */
export class Gradient {
  constructor(
    readonly kind: GradientKind,
    readonly stops: readonly GradientStop[],
    readonly extend: Extend = Extend.Pad,
    readonly interpolationAlphaSpace: InterpolationAlphaSpace = InterpolationAlphaSpace.Srgb,
    readonly interpolationHueDirection: 'shorter' | 'longer' | 'increasing' | 'decreasing' = 'shorter',
  ) {}
}

/** How an image is sampled, as peniko's `ImageQuality`. */
export enum ImageQuality {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

/** A matte applied to an image brush, as peniko's `ImageQuality` companion. */
export type ImageData =
  | { readonly kind: 'rgba8'; readonly data: Uint8Array; readonly width: number; readonly height: number }
  | { readonly kind: 'rgba8-premultiplied'; readonly data: Uint8Array; readonly width: number; readonly height: number };

/**
 * An image brush, as peniko's `ImageBrush`.
 *
 * Upstream is generic over the image source so backends can pass their own
 * texture type. The port fixes it to CPU RGBA because a Node process has no
 * GPU texture to name; a backend with a GPU can wrap this.
 */
export class ImageBrush {
  constructor(
    readonly image: ImageData,
    readonly quality: ImageQuality = ImageQuality.Medium,
    readonly extendX: Extend = Extend.Pad,
    readonly extendY: Extend = Extend.Pad,
    /** Transform from image space to paint space, as a 2x3 row-major matrix. */
    readonly transform: readonly [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0],
    readonly alpha: number = 1,
  ) {}
}

/** A blurred rounded rectangle, as peniko's `BlurredRoundedRect`. */
export interface BlurredRoundedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly color: Color;
  /** Standard deviation of the blur, in pixels. */
  readonly stdDev: number;
}

/**
 * What a paint layer fills with, as peniko's `Brush`.
 *
 * A discriminated union rather than upstream's generic enum, so the renderer
 * can switch on it directly.
 */
export type Brush<C = Color> =
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

/**
 * The complete style for a paint operation, as peniko's `Style`.
 *
 * Upstream `Style` bundles a brush with a blend mode and a few flags; the port
 * keeps the flags as plain optionals rather than a builder.
 */
export class PaintStyle<C = Color> {
  constructor(
    readonly brush: Brush<C>,
    readonly blend: BlendMode = BlendMode.DEFAULT,
    readonly alpha: number = 1,
  ) {}
}
