/**
 * Not ported: the `color` crate's `flags.rs` defines `Missing`, a four-bit
 * bitset of which components a colour is missing, and `Flags`, which pairs it
 * with a `ColorSpaceTag`.
 *
 * Upstream this exists so that `DynamicColor` can carry a partially specified
 * colour — the CSS `rgb(none 0 0)` form — and resolve the missing components
 * during interpolation. With no `DynamicColor` in this port there is nothing to
 * carry a partial colour in.
 */
