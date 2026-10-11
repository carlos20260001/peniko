/**
 * Not ported: the `color` crate's `dynamic.rs` holds `DynamicColor`, where the
 * color space is a runtime `ColorSpaceTag` rather than a type parameter, and the
 * `Interpolator` / `UnpremultipliedInterpolator` built on it.
 *
 * This is the single largest omission in the port. It is what makes
 * `color::parse_color` and CSS gradients work, because a parsed colour has no
 * static space to name. Everything the rendering pipeline needs can be said with
 * a static space: brushes carry `AlphaColor<Srgb>`, gradients interpolate in
 * sRGB or linear sRGB, and the render target holds `PremulRgba8`. So the port
 * keeps the static types and waits until there is a caller for the dynamic one.
 */
