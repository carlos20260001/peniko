/**
 * A TypeScript port of the [`color`](https://crates.io/crates/color) crate, which
 * is peniko's colour dependency.
 *
 * Upstream the crate is `no_std` and feature-gated on `std`/`libm`/`bytemuck`/
 * `serde`. None of those gates have a counterpart here: Node's `Math` is always
 * the "std" that supplies the floating point functions, and neither bytemuck nor
 * serde are reachable from this port. What is left is the part the rendering
 * pipeline actually depends on — the sRGB transfer functions, `AlphaColor` with
 * premultiplication and colour-space conversion, and the packed `Rgba8` /
 * `PremulRgba8` representations.
 *
 * The module tree mirrors the crate's own (`colorspace.rs` → `colorspace.ts`,
 * and so on, including `palette/`), so a reader can diff a ported file against
 * the Rust it came from. Modules that are deliberately not ported carry a note
 * saying why instead of an empty file.
 *
 * The list below is upstream's `pub use` list, minus the modules this port
 * omits. The crate's numeric primitives (`Vec3`, the matrix helpers,
 * `u8_to_f32`) live in `floatfuncs.ts` rather than here, for the reason that
 * file gives.
 */

export * from './chromaticity.js';
export * from './color.js';
export * from './colorspace.js';
export * from './rgba8.js';
export * from './tag.js';
