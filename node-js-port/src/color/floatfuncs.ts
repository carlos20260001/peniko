/**
 * A TypeScript port of the `color` crate's `floatfuncs.rs`.
 *
 * Upstream this module exists only to select between libstd and libm: it is
 * compiled when the `std` feature is off, and forwards a handful of `f32`
 * methods to libm. Node has nothing to select — `Math` *is* the standard
 * library — so the shims reduce to the two functions the crate's own comment
 * singles out as only recently added to `core`, and which JS spells differently
 * enough to be worth naming.
 *
 * It also holds the crate's numeric primitives: the `Vec3`/`Vec4`/`Mat3` shapes
 * and the matrix helpers. Upstream keeps those in `lib.rs` next to the
 * re-exports, but a TypeScript module that re-exports its submodules cannot also
 * be imported by them — ESM initialises a module's bindings before its imports
 * have run, so a submodule reading a crate-root constant during its own
 * evaluation sees `undefined`. Keeping them here, in a module nothing else
 * imports from below, keeps the graph acyclic. It also keeps them private, which
 * is what `lib.rs` does with them anyway.
 */

/** A three-component colour value, upstream `[f32; 3]`. */
export type Vec3 = readonly [number, number, number];

/** A colour plus a separate alpha channel, upstream `[f32; 4]`. */
export type Vec4 = readonly [number, number, number, number];

/** A 3x3 matrix in row-major order, upstream `[[f32; 3]; 3]`. */
export type Mat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** `f32::abs`. */
export function abs(x: number): number {
  return Math.abs(x);
}

/**
 * `f32::copysign`: the magnitude of `x` carrying the sign of `sign`.
 *
 * The one respect in which this cannot copy Rust exactly is the sign of a zero
 * result — Rust preserves the sign bit of `sign`, so `copysign(-1, -0.0)` is
 * `1.0`, and a `sign` of `-0` compares equal to zero in JS. Both sRGB transfer
 * functions only reach `copysign` from the branch where the *input* is non-zero,
 * so a zero `x` is the only way to observe the difference and that case is
 * unreachable from them.
 */
export function copysign(x: number, sign: number): number {
  return sign < 0 ? -Math.abs(x) : Math.abs(x);
}

/**
 * The crate root's `const fn u8_to_f32`: the single place a `u8` becomes a
 * component value, so the round trip through `Rgba8` has exactly one scale.
 */
export function u8_to_f32(x: number): number {
  return x * (1.0 / 255.0);
}

/** Multiplication `m * x` of a 3x3-matrix `m` and a 3-vector `x`. */
export function matvecmul(m: Mat3, x: Vec3): Vec3 {
  return [
    m[0][0] * x[0] + m[0][1] * x[1] + m[0][2] * x[2],
    m[1][0] * x[0] + m[1][1] * x[1] + m[1][2] * x[2],
    m[2][0] * x[0] + m[2][1] * x[1] + m[2][2] * x[2],
  ];
}

/** Multiplication `ma * mb` of two 3x3-matrices. */
export function matmatmul(ma: Mat3, mb: Mat3): Mat3 {
  return [
    [
      ma[0][0] * mb[0][0] + ma[0][1] * mb[1][0] + ma[0][2] * mb[2][0],
      ma[0][0] * mb[0][1] + ma[0][1] * mb[1][1] + ma[0][2] * mb[2][1],
      ma[0][0] * mb[0][2] + ma[0][1] * mb[1][2] + ma[0][2] * mb[2][2],
    ],
    [
      ma[1][0] * mb[0][0] + ma[1][1] * mb[1][0] + ma[1][2] * mb[2][0],
      ma[1][0] * mb[0][1] + ma[1][1] * mb[1][1] + ma[1][2] * mb[2][1],
      ma[1][0] * mb[0][2] + ma[1][1] * mb[1][2] + ma[1][2] * mb[2][2],
    ],
    [
      ma[2][0] * mb[0][0] + ma[2][1] * mb[1][0] + ma[2][2] * mb[2][0],
      ma[2][0] * mb[0][1] + ma[2][1] * mb[1][1] + ma[2][2] * mb[2][1],
      ma[2][0] * mb[0][2] + ma[2][1] * mb[1][2] + ma[2][2] * mb[2][2],
    ],
  ];
}

/**
 * Multiplication `ma * mb`, where `mb` is the diagonal matrix with `mb`'s
 * entries on the diagonal.
 */
export function matdiagmatmul(ma: Mat3, mb: Vec3): Mat3 {
  return [
    [ma[0][0] * mb[0], ma[0][1] * mb[1], ma[0][2] * mb[2]],
    [ma[1][0] * mb[0], ma[1][1] * mb[1], ma[1][2] * mb[2]],
    [ma[2][0] * mb[0], ma[2][1] * mb[1], ma[2][2] * mb[2]],
  ];
}
