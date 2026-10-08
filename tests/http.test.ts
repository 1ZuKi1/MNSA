import { describe, expect, it } from 'vitest';
import { safeNext } from '../src/lib/http';

describe('safeNext: redirects stay on this site', () => {
  it('keeps paths on this site', () => {
    expect(safeNext('/barimt/3')).toBe('/barimt/3');
    expect(safeNext('/ajil?scope=mine')).toBe('/ajil?scope=mine');
  });

  it('refuses other sites, however they are written', () => {
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    // Browsers drop tabs and line breaks inside a URL: these would all become //evil.example.
    expect(safeNext('/\t/evil.example')).toBe('/');
    expect(safeNext('/\n/evil.example')).toBe('/');
    expect(safeNext('/\r/evil.example')).toBe('/');
    expect(safeNext(' //evil.example')).toBe('/');
  });

  it('falls back when there is nothing usable', () => {
    expect(safeNext(null, '/ajil')).toBe('/ajil');
    expect(safeNext('', '/ajil')).toBe('/ajil');
  });
});
