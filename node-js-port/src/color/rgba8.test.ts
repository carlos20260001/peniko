import { describe, expect, it } from 'vitest';

import { PremulRgba8, Rgba8 } from './rgba8.js';

describe('Rgba8', () => {
  it('packs little-endian, r least significant', () => {
    expect(new Rgba8(1, 2, 3, 4).to_u32()).toBe(0x04030201);
    expect(new PremulRgba8(0xaa, 0xbb, 0xcc, 0xff).to_u32()).toBe(0xffccbbaa);
  });

  it('unpacks what it packs', () => {
    expect(Rgba8.from_u32(0x04030201)).toEqual(new Rgba8(1, 2, 3, 4));
    expect(PremulRgba8.from_u32(0xffccbbaa)).toEqual(new PremulRgba8(0xaa, 0xbb, 0xcc, 0xff));
  });

  it('moves through the byte array form', () => {
    const c = new Rgba8(1, 2, 3, 4);
    expect(c.to_u8_array()).toEqual([1, 2, 3, 4]);
    expect(Rgba8.from_u8_array(c.to_u8_array())).toEqual(c);

    const p = new PremulRgba8(0xaa, 0xbb, 0xcc, 0xff);
    expect(p.to_u8_array()).toEqual([0xaa, 0xbb, 0xcc, 0xff]);
    expect(PremulRgba8.from_u8_array(p.to_u8_array())).toEqual(p);
  });
});
