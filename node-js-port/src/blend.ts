/**
 * A TypeScript port of `peniko`'s `blend.rs`.
 *
 * The enums live here, exactly where upstream defines them, and `compose.ts`
 * imports them from here rather than the other way round — the arithmetic needs
 * the modes, but the modes need no arithmetic.
 *
 * Upstream splits the arithmetic three ways (`peniko::blend` for the modes,
 * `vello_cpu::fine::highp::blend` for the per-channel mixing and
 * `vello_cpu::fine::highp::compose` for the alpha). This port keeps the two
 * halves in `compose.ts`, because `compose` needs a mixed source colour to
 * composite.
 */

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
    return (
      this.compose === Compose.Clear ||
      this.compose === Compose.Copy ||
      this.compose === Compose.SrcOut
    );
  }

  /** The default: normal mixing, source over. */
  static readonly DEFAULT = new BlendMode();
}
