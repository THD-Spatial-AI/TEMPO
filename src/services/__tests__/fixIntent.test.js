import { describe, it, expect } from 'vitest';
import { requestFix, takeFix } from '../fixIntent';

describe('fixIntent', () => {
  it('hands the target to its own view once', () => {
    requestFix({ view: 'Locations', kind: 'location', id: 'a' });
    expect(takeFix('Technologies')).toBeNull();
    expect(takeFix('Locations')).toEqual({ view: 'Locations', kind: 'location', id: 'a' });
    expect(takeFix('Locations')).toBeNull();
  });

  it('keeps only the latest request', () => {
    requestFix({ view: 'Links', kind: 'link', from: 'a', to: 'b' });
    requestFix({ view: 'Locations', kind: 'location', id: 'b' });
    expect(takeFix('Links')).toBeNull();
    expect(takeFix('Locations').id).toBe('b');
  });
});
