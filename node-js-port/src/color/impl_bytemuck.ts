/**
 * Not ported: the `color` crate's `impl_bytemuck.rs` derives the `bytemuck`
 * traits for the colour types so they can be viewed as raw bytes.
 *
 * There is no counterpart to derive here — a `Uint8Array` view over a class
 * instance would be a different and much weaker guarantee than the zero-cost
 * `Pod` cast upstream. `Rgba8` and `PremulRgba8` already expose `to_u32` and
 * `to_u8_array` for the call sites that want the bytes.
 */
