/**
 * A TypeScript port of `peniko`, the paint layer for `vello`.
 *
 * `peniko` answers two questions: what to paint (a solid colour, a gradient or
 * an image) and how it combines with what is already there (a `BlendMode` of a
 * CSS `mix-blend-mode` plus a `background-blend-mode`).
 *
 * The module tree mirrors the crate's own: `blend.rs` is `blend.ts`,
 * `gradient.rs` is `gradient.ts`, and so on, with the `color` dependency ported
 * beneath `color/`. Two modules sit outside that tree and are re-exported
 * alongside it:
 *
 * - `compose.ts` holds the blend arithmetic. Upstream that lives in
 *   `vello_cpu::fine::highp`, not in peniko, but it is only meaningful next to
 *   the modes it consumes, and this port has no other home for it.
 * - `fill.ts` is an earlier iteration's epaint-facing convenience layer, kept
 *   out of the re-export list because its `Brush`, `Fill` and `Style` names now
 *   collide with the faithful ports. It is not part of the crate's surface.
 *
 * Colour is no longer delegated. The port carries `color`'s `AlphaColor`,
 * `PremulColor` and `PremulRgba8` — see `color/lib.ts` — because vello
 * composites in premultiplied linear-light sRGB and every blend, gradient and
 * antialiased edge depends on that representation being the real one.
 */

import * as color from './color/lib.js';

export * from './blend.js';
export * from './blurred_rounded_rect.js';
export * from './brush.js';
export * from './compose.js';
export * from './gradient.js';
export * from './image.js';
export * from './style.js';

/** Re-export of the ported `color` library. */
export { color };

/**
 * A convenient alias for the colour type used for {@link Brush}, upstream's
 * `pub type Color = color::AlphaColor<color::Srgb>`.
 */
export type Color = color.AlphaColor<color.Srgb>;
