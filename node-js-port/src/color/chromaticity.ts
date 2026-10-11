/**
 * A TypeScript port of the `color` crate's `chromaticity.rs`.
 *
 * A `Chromaticity` is a CIE `xy` pair: a white point without a luminosity. The
 * color spaces this port implements are all D65, so the adaptation matrices are
 * not on the hot path — but they are on `ColorSpace`'s public surface, so they
 * are ported rather than stubbed, and are covered by a test that adapting D65 to
 * itself is the identity.
 */

import { matdiagmatmul, matmatmul, matvecmul, type Mat3, type Vec3 } from './floatfuncs.js';

export interface Chromaticity {
  /** The x-coordinate of the CIE `xy` chromaticity. */
  readonly x: number;

  /** The y-coordinate of the CIE `xy` chromaticity. */
  readonly y: number;

  /** Convert the `xy` chromaticities to XYZ, assuming `xyY` with `Y=1`. */
  to_xyz(): Vec3;

  /**
   * Calculate the 3x3 linear Bradford chromatic adaptation matrix from linear
   * sRGB space: from a reference white of `this` to a reference white of `to`.
   */
  linear_srgb_chromatic_adaptation_matrix(to: Chromaticity): Mat3;
}

/**
 * Upstream evaluates these in `const` context, so every entry is an exact `f32`
 * rounded once, at compile time. The port divides in `f64` instead, which is the
 * same value to within a rounding of the last bits; only paths that actually
 * adapt between two different white points can observe it, and none of the
 * ported color spaces does.
 */
const SRGB_TO_BRADFORD: Mat3 = [
  [1_298_421_353 / 3_072_037_500, 172_510_403 / 351_090_000, 32_024_671 / 1_170_300_000],
  [85_542_113 / 1_536_018_750, 7_089_448_151 / 7_372_890_000, 244_246_729 / 10_532_700_000],
  [131_355_661 / 6_144_075_000, 71_798_777 / 819_210_000, 3_443_292_119 / 3_510_900_000],
];

const BRADFORD_TO_SRGB: Mat3 = [
  [
    3_597_831_250_055_000 / 1_417_335_035_684_489,
    -1_833_298_161_702_000 / 1_417_335_035_684_489,
    -57_038_163_791_000 / 1_417_335_035_684_489,
  ],
  [
    -4_593_417_841_453_000 / 31_461_687_363_220_151,
    35_130_825_086_032_200 / 31_461_687_363_220_151,
    -702_492_905_752_400 / 31_461_687_363_220_151,
  ],
  [
    -191_861_334_350_000 / 4_536_975_728_019_583,
    -324_802_409_790_000 / 4_536_975_728_019_583,
    4_639_090_845_380_000 / 4_536_975_728_019_583,
  ],
];

const XYZ_TO_BRADFORD: Mat3 = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];

const from_xy = (x: number, y: number): Chromaticity => ({
  x,
  y,
  to_xyz() {
    const y_recip = 1 / this.y;
    return [this.x * y_recip, 1, (1 - this.x - this.y) * y_recip];
  },
  linear_srgb_chromatic_adaptation_matrix(to: Chromaticity) {
    const bradford_source = matvecmul(XYZ_TO_BRADFORD, this.to_xyz());
    const bradford_dest = matvecmul(XYZ_TO_BRADFORD, to.to_xyz());

    return matmatmul(
      matdiagmatmul(BRADFORD_TO_SRGB, [
        bradford_dest[0] / bradford_source[0],
        bradford_dest[1] / bradford_source[1],
        bradford_dest[2] / bradford_source[2],
      ]),
      SRGB_TO_BRADFORD,
    );
  },
});

/**
 * The CIE D65 white point under the standard 2° observer, truncated to four
 * digits as CSS Color 4 specifies.
 */
export const D65: Chromaticity = from_xy(0.3127, 0.329);

/** The CIE D50 white point under the standard 2° observer. */
export const D50: Chromaticity = from_xy(0.3457, 0.3585);

/** The ACES reference white, near D60. */
export const ACES: Chromaticity = from_xy(0.32168, 0.33767);
