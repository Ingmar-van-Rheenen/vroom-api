import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from '../../src/lib/tokens.js';

describe('tokens', () => {
  it('genereert url-safe tokens van voldoende lengte', () => {
    const t = generateToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(40);
  });

  it('genereert elke keer een uniek token', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(set.size).toBe(100);
  });

  it('hasht deterministisch en onomkeerbaar', () => {
    const token = generateToken();
    const h1 = hashToken(token);
    const h2 = hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(token);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('geeft verschillende hashes voor verschillende input', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});
