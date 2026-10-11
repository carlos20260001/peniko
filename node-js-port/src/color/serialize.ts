/**
 * Not ported: the `color` crate's `serialize.rs`.
 *
 * Upstream this is a hand-written `Display` for `AlphaColor` and `PremulColor`,
 * which emits a CSS `color()` string rather than the `rgb()`/`rgba()` string the
 * derive would produce. The distinction matters only to a consumer that reads
 * the colour back with the crate's own parser, which this port does not have.
 */
