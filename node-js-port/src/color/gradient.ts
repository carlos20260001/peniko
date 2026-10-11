/**
 * Not ported: the `color` crate's `gradient.rs`, the interpolation machinery
 * behind `gradient` and `gradient_unpremultiplied`.
 *
 * Careful not to confuse this with peniko's own `gradient.rs`, which *is* ported
 * (`../gradient.ts`): that one is the description of a gradient — kind, stops,
 * extend mode, interpolation space. This one is the sampler that walks the stops
 * and produces the intermediate colours, including the hue fixup that a
 * cylindrical space needs.
 *
 * It is left out because the only interpolator a renderer needs here is the
 * premultiplied sRGB one, and vello's fine stage does that inline on the packed
 * ramp. If the ramp ever has to be built on the CPU, this module is where the
 * `HueDirection` fixup and the missing-component handling come back.
 */
