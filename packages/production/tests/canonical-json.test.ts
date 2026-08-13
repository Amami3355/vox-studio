import { describe, expect, it } from 'vitest';
import { canonicalJson, hashCanonicalJson, sha256Bytes } from '../src/canonical-json';

describe('RFC 8785 canonical JSON', () => {
  it('sorts object keys recursively and uses ECMAScript number serialization', () => {
    expect(
      canonicalJson({
        numbers: [Number('333333333.33333329'), 1e30, 4.5, 0.002, 1e-27],
        object: { b: true, a: null },
      }),
    ).toBe('{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"object":{"a":null,"b":true}}');
  });

  it('sorts property names by UTF-16 code units', () => {
    expect(canonicalJson({ '😀': 5, '€': 4, ö: 3, '1': 2, '\r': 1 })).toBe(
      '{"\\r":1,"1":2,"ö":3,"€":4,"😀":5}',
    );
  });

  it('rejects values outside I-JSON', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalJson('\ud800')).toThrow(/surrogate/);
    expect(() => canonicalJson(new Date() as never)).toThrow(/plain objects/);
  });

  it('purpose-tags and protocol-versions semantic hashes', () => {
    const value = { beats: ['one', 'two'] };
    const plan = hashCanonicalJson('plan', value);

    expect(plan).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCanonicalJson('recording-input', value)).not.toBe(plan);
    expect(hashCanonicalJson('plan', value, 2)).not.toBe(plan);
    expect(sha256Bytes('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
