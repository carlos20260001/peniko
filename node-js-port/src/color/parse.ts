/**
 * Not ported: the `color` crate's `parse.rs`, the CSS `Color 4` colour parser
 * behind `parse_color` and `parse_color_prefix`.
 *
 * This is the second-largest omission after `dynamic.rs`, and it is here rather
 * than in the ported set for a reason: the parser is where `DynamicColor` gets
 * produced, since a string names no static color space. Nothing in this port
 * parses a colour from a string — colours arrive as `AlphaColor<Srgb>` values
 * from the caller, and peniko's own `Brush` takes a colour, not a string.
 *
 * The pieces that *are* independent of the dynamic type — `hsl()`, `hwb()`, the
 * keyword table, the number/percentage grammar — are entangled with it throughout
 * upstream, so porting half would mean rewriting rather than translating.
 */
