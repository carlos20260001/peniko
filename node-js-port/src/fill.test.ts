import { describe, expect, it } from 'vitest';

import { Extend, Fill, SolidBrush, SolidFill, Style, WrapMode, solid } from './fill.js';

describe('Fill', () => {
  it('carries a single solid colour through', () => {
    const s = solid({ r: 1, g: 0, b: 0, a: 0.5 });
    expect(s.fill).toBeInstanceOf(SolidFill);
    expect(s.fill.kind).toBe('solid');
    expect((s.fill as SolidFill).color()).toEqual({ r: 1, g: 0, b: 0, a: 0.5 });
  });

  it('exposes the brush', () => {
    const brush = new SolidBrush(0xff0000ff);
    const f = new SolidFill(brush);
    expect(f.brush).toBe(brush);
    expect(f.color()).toBe(0xff0000ff);
  });

  it('exposes Extend and WrapMode for API compatibility', () => {
    // Present upstream, never read by the glyph rasterizer.
    expect(Extend.Pad).toBe('Pad');
    expect(WrapMode.Reflect).toBe('Reflect');
  });

  it('types the fill as a discriminated union', () => {
    const f: Fill = new SolidFill(new SolidBrush(1));
    expect(f.kind).toBe('solid');
  });

  it('builds a style directly', () => {
    const s = Style.solid(7);
    expect(s.fill.kind).toBe('solid');
  });
});
