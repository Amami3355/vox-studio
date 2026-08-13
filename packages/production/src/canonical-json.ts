import { createHash } from 'node:crypto';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const assertUnicodeScalarString = (value: string): void => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw new TypeError('Lone high surrogate is not I-JSON.');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError('Lone low surrogate is not I-JSON.');
    }
  }
};

/** RFC 8785 JSON Canonicalization Scheme for I-JSON values. */
export const canonicalJson = (value: JsonValue): string => {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON rejects non-finite numbers.');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertUnicodeScalarString(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical JSON accepts plain objects only.');
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      assertUnicodeScalarString(key);
      const member = value[key];
      if (member === undefined) throw new TypeError('Canonical JSON rejects undefined members.');
      return `${JSON.stringify(key)}:${canonicalJson(member)}`;
    })
    .join(',')}}`;
};

export const purposeTaggedCanonicalJson = (
  purpose: string,
  value: JsonValue,
  protocolVersion = 1,
): string => {
  if (purpose.length === 0) throw new TypeError('Hash purpose must be non-empty.');
  return canonicalJson({ protocolVersion, purpose, value });
};

export const sha256Bytes = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

export const hashCanonicalJson = (purpose: string, value: JsonValue, protocolVersion = 1): string =>
  sha256Bytes(purposeTaggedCanonicalJson(purpose, value, protocolVersion));
