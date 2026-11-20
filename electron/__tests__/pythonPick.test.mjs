import { describe, it, expect } from 'vitest';
import pythonPick from '../pythonPick.cjs';
const { parseProbe, isUsable, probePython } = pythonPick;

describe('isUsable', () => {
  const py = (minor, bits = 64) => ({ major: 3, minor, bits });

  it('accepts 64-bit 3.10 to 3.13', () => {
    for (const minor of [10, 11, 12, 13]) expect(isUsable(py(minor))).toBe(true);
  });

  it('rejects interpreters newer than the pinned stacks have wheels for', () => {
    expect(isUsable(py(14))).toBe(false);
    expect(isUsable(py(15))).toBe(false);
  });

  it('rejects older ones and honours the minimum', () => {
    expect(isUsable(py(9))).toBe(false);
    expect(isUsable(py(11), 12)).toBe(false);
    expect(isUsable(py(12), 12)).toBe(true);
  });

  it('rejects 32-bit and missing interpreters', () => {
    expect(isUsable(py(11, 32))).toBe(false);
    expect(isUsable(null)).toBe(false);
    expect(isUsable({ major: 2, minor: 7, bits: 64 })).toBe(false);
  });
});

describe('probePython', () => {
  it('parses the interpreter report', () => {
    expect(parseProbe('3 11 64\n')).toEqual({ major: 3, minor: 11, bits: 64 });
    expect(parseProbe('garbage')).toBeNull();
  });

  it('returns null when the command cannot run', () => {
    const boom = () => { throw new Error('ENOENT'); };
    expect(probePython('python', boom)).toBeNull();
  });

  it('uses the command output', () => {
    expect(probePython('python', () => Buffer.from('3 14 64\n'))).toEqual({ major: 3, minor: 14, bits: 64 });
  });
});
