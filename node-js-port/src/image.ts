/**
 * A TypeScript port of `peniko`'s `image.rs`.
 *
 * Two deviations. Upstream `ImageData` owns a `Blob`, an atomically reference
 * counted byte buffer from `linebender_resource_handle`, and `ImageBrush` is
 * generic over the storage so a renderer can substitute its own texture handle.
 * The port fixes both: the storage is a `Uint8Array`, because a Node process
 * hands over a plain buffer, and `ImageBrush` takes an `ImageData` directly.
 * `ImageBrushRef` falls away with the generality — a TypeScript object reference
 * is already free.
 */

import { Extend } from './brush.js';

/** Defines the pixel format of an {@link ImageData}, as `ImageFormat`. */
export enum ImageFormat {
  /** 32-bit RGBA with 8-bit channels. */
  Rgba8 = 0,
  /** 32-bit BGRA with 8-bit channels. */
  Bgra8 = 1,
}

/** Handling of alpha channel, as `ImageAlphaType`. */
export enum ImageAlphaType {
  /** Image has separate alpha channel (also called straight/unpremultiplied alpha). */
  Alpha = 0,
  /** Image has colours with premultiplied alpha. */
  AlphaPremultiplied = 1,
}

/** Defines the desired quality for sampling an image, as `ImageQuality`. */
export enum ImageQuality {
  /** Lowest quality with best performance characteristics. */
  Low = 0,
  /** Medium quality with reasonable performance characteristics. */
  Medium = 1,
  /** Highest quality with worst performance characteristics. */
  High = 2,
}

/** Owned image resource, upstream `ImageData`. */
export interface ImageData {
  /** The image bytes. */
  readonly data: Uint8Array;
  /** Pixel format of the image. */
  readonly format: ImageFormat;
  /** Encoding of alpha in the image pixels. */
  readonly alpha_type: ImageAlphaType;
  /** Width of the image. */
  readonly width: number;
  /** Height of the image. */
  readonly height: number;
}

/** Parameters which specify how to sample an image during rendering, as `ImageSampler`. */
export class ImageSampler {
  constructor(
    /** Extend mode in the horizontal direction. */
    readonly x_extend: Extend = Extend.Pad,
    /** Extend mode in the vertical direction. */
    readonly y_extend: Extend = Extend.Pad,
    /** Hint for desired rendering quality. */
    readonly quality: ImageQuality = ImageQuality.Medium,
    /** An additional alpha multiplier to use with the image. */
    readonly alpha: number = 1,
  ) {}

  /** Creates a new `ImageSampler` with default values. */
  static new(): ImageSampler {
    return new ImageSampler();
  }

  /** Builder method for setting the image extend mode in both directions. */
  with_extend(mode: Extend): ImageSampler {
    return new ImageSampler(mode, mode, this.quality, this.alpha);
  }

  /** Builder method for setting the extend mode in the horizontal direction. */
  with_x_extend(mode: Extend): ImageSampler {
    return new ImageSampler(mode, this.y_extend, this.quality, this.alpha);
  }

  /** Builder method for setting the extend mode in the vertical direction. */
  with_y_extend(mode: Extend): ImageSampler {
    return new ImageSampler(this.x_extend, mode, this.quality, this.alpha);
  }

  /** Builder method for setting a hint for the desired image quality. */
  with_quality(quality: ImageQuality): ImageSampler {
    return new ImageSampler(this.x_extend, this.y_extend, quality, this.alpha);
  }

  /** Returns the sampler with the alpha multiplier set to `alpha`. */
  with_alpha(alpha: number): ImageSampler {
    return new ImageSampler(this.x_extend, this.y_extend, this.quality, alpha);
  }

  /** Returns the sampler with the alpha multiplier multiplied again by `alpha`. */
  multiply_alpha(alpha: number): ImageSampler {
    return new ImageSampler(this.x_extend, this.y_extend, this.quality, this.alpha * alpha);
  }
}

/** Describes the image content of a filled or stroked shape, as `ImageBrush`. */
export class ImageBrush {
  constructor(
    /** The image to render. */
    readonly image: ImageData,
    /** Parameters which specify how to sample from the image during rendering. */
    readonly sampler: ImageSampler = new ImageSampler(),
  ) {}

  /** Creates a new `ImageBrush` for the specified `ImageData`. */
  static new(image: ImageData): ImageBrush {
    return new ImageBrush(image);
  }

  /** Builder method for setting the image extend mode in both directions. */
  with_extend(mode: Extend): ImageBrush {
    return new ImageBrush(this.image, this.sampler.with_extend(mode));
  }

  /** Builder method for setting the extend mode in the horizontal direction. */
  with_x_extend(mode: Extend): ImageBrush {
    return new ImageBrush(this.image, this.sampler.with_x_extend(mode));
  }

  /** Builder method for setting the extend mode in the vertical direction. */
  with_y_extend(mode: Extend): ImageBrush {
    return new ImageBrush(this.image, this.sampler.with_y_extend(mode));
  }

  /** Builder method for setting a hint for the desired image quality. */
  with_quality(quality: ImageQuality): ImageBrush {
    return new ImageBrush(this.image, this.sampler.with_quality(quality));
  }

  /** Returns the image with the alpha multiplier set to `alpha`. */
  with_alpha(alpha: number): ImageBrush {
    return new ImageBrush(this.image, this.sampler.with_alpha(alpha));
  }

  /** Returns the image with the alpha multiplier multiplied again by `alpha`. */
  multiply_alpha(alpha: number): ImageBrush {
    return new ImageBrush(this.image, this.sampler.multiply_alpha(alpha));
  }
}
