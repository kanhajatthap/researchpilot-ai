import { describe, it, expect } from 'vitest';
import { safeEvaluate } from '@/lib/agents/safe-calculator';

describe('safeEvaluate - security tests', () => {
  it('should evaluate basic arithmetic', () => {
    expect(safeEvaluate('2 + 2')).toBe(4);
    expect(safeEvaluate('10 - 5')).toBe(5);
    expect(safeEvaluate('3 * 4')).toBe(12);
    expect(safeEvaluate('20 / 4')).toBe(5);
  });

  it('should handle operator precedence', () => {
    expect(safeEvaluate('2 + 3 * 4')).toBe(14);
    expect(safeEvaluate('(2 + 3) * 4')).toBe(20);
    expect(safeEvaluate('10 / 2 * 3')).toBe(15);
  });

  it('should handle negative numbers', () => {
    expect(safeEvaluate('-5 + 3')).toBe(-2);
    expect(safeEvaluate('5 * -2')).toBe(-10);
    expect(safeEvaluate('10 - -3')).toBe(13);
  });

  it('should handle decimal numbers', () => {
    expect(safeEvaluate('3.14 + 2.86')).toBeCloseTo(6);
    expect(safeEvaluate('10.5 / 2')).toBeCloseTo(5.25);
    expect(safeEvaluate('1.5 * 4')).toBeCloseTo(6);
  });

  it('should handle division by zero', () => {
    expect(() => safeEvaluate('5 / 0')).toThrow('Division by zero');
  });

  it('should reject eval() calls', () => {
    expect(() => safeEvaluate('eval("1+1")')).toThrow();
  });

  it('should reject Function() constructor', () => {
    expect(() => safeEvaluate('Function("return 1")()')).toThrow();
  });

  it('should reject identifiers', () => {
    expect(() => safeEvaluate('window')).toThrow();
    expect(() => safeEvaluate('document')).toThrow();
    expect(() => safeEvaluate('process')).toThrow();
    expect(() => safeEvaluate('console')).toThrow();
    expect(() => safeEvaluate('globalThis')).toThrow();
  });

  it('should reject property access', () => {
    expect(() => safeEvaluate('1.constructor')).toThrow();
    expect(() => safeEvaluate('"".length')).toThrow();
    expect(() => safeEvaluate('[].length')).toThrow();
  });

  it('should reject arbitrary JavaScript', () => {
    expect(() => safeEvaluate('1; alert("xss")')).toThrow();
    expect(() => safeEvaluate('1+1; fetch("http://evil.com")')).toThrow();
    expect(() => safeEvaluate('return 1')).toThrow();
  });

  it('should reject malformed expressions', () => {
    expect(() => safeEvaluate('')).toThrow();
    expect(() => safeEvaluate('2 +')).toThrow();
    expect(() => safeEvaluate('+ 2')).toThrow();
    expect(() => safeEvaluate('2 3 + 4')).toThrow();
  });

  it('should reject exponentiation via **', () => {
    expect(() => safeEvaluate('2 ** 3')).toThrow();
  });

  it('should handle whitespace', () => {
    expect(safeEvaluate('  2  +  3  ')).toBe(5);
    expect(safeEvaluate('2+3')).toBe(5);
  });

  it('should handle large numbers', () => {
    expect(safeEvaluate('1000000 * 1000000')).toBe(1000000000000);
  });

  it('should handle floating point precision', () => {
    expect(safeEvaluate('0.1 + 0.2')).toBeCloseTo(0.3, 1);
  });
});