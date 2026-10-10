/**
 * A TypeScript port of `peniko`, the paint layer for `vello`.
 *
 * `peniko` answers two questions: what to paint (a solid colour, a gradient or
 * an image) and how it combines with what is already there (a `BlendMode` of a
 * CSS `mix-blend-mode` plus a `background-blend-mode`).
 *
 * Colour types are not ported here. `@egui-node/ecolor-ts` supplies them, so
 * the pipeline has one colour implementation; see `peniko.ts` for the trade.
 */

export * from './peniko.js';
export * from './compose.js';
