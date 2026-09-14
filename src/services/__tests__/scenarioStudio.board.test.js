import { describe, it, expect } from 'vitest';
import { canConnect, deriveGroups, groupForNode } from '../scenarioStudio/board.js';

// Minimal node factory — only the fields board.js reads.
function node(id, recipeId, params = {}) {
  return { id, type: 'recipeCard', position: { x: 0, y: 0 }, data: { recipeId, params } };
}
function edge(source, target) {
  return { id: `${source}->${target}`, source, target };
}

// ─── canConnect ─────────────────────────────────────────────────────────────────

describe('canConnect', () => {
  const nodes = [node('a', 'demandGrowth'), node('b', 'carbonCap'), node('c', 'costSensitivity')];

  it('allows a fresh source→target with no existing edges', () => {
    expect(canConnect(nodes, [], { source: 'a', target: 'b' })).toBe(true);
  });

  it('rejects a self-loop', () => {
    expect(canConnect(nodes, [], { source: 'a', target: 'a' })).toBe(false);
  });

  it('rejects when the source already has an outgoing edge (keeps chains linear)', () => {
    expect(canConnect(nodes, [edge('a', 'b')], { source: 'a', target: 'c' })).toBe(false);
  });

  it('rejects when the target already has an incoming edge (no merges)', () => {
    expect(canConnect(nodes, [edge('a', 'b')], { source: 'c', target: 'b' })).toBe(false);
  });

  it('rejects a cycle', () => {
    const es = [edge('a', 'b'), edge('b', 'c')];
    expect(canConnect(nodes, es, { source: 'c', target: 'a' })).toBe(false);
  });

  it('rejects any edge touching a SPORES node', () => {
    const ns = [node('a', 'demandGrowth'), node('s', 'spores')];
    expect(canConnect(ns, [], { source: 'a', target: 's' })).toBe(false);
    expect(canConnect(ns, [], { source: 's', target: 'a' })).toBe(false);
  });

  it('rejects when a node id is missing', () => {
    expect(canConnect(nodes, [], { source: 'a', target: 'zzz' })).toBe(false);
  });
});

// ─── deriveGroups ─────────────────────────────────────────────────────────────────

describe('deriveGroups', () => {
  it('treats a lone node as a group of one', () => {
    const nodes = [node('a', 'demandGrowth')];
    const groups = deriveGroups(nodes, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodeIds).toEqual(['a']);
    expect(groups[0].layers).toEqual([{ recipeId: 'demandGrowth', params: {} }]);
    expect(groups[0].isSpores).toBe(false);
  });

  it('orders a wired chain head-first regardless of edge insertion order', () => {
    const nodes = [node('b', 'carbonCap'), node('a', 'demandGrowth'), node('c', 'costSensitivity')];
    const edges = [edge('b', 'c'), edge('a', 'b')]; // a → b → c
    const groups = deriveGroups(nodes, edges);
    expect(groups).toHaveLength(1);
    expect(groups[0].head).toBe('a');
    expect(groups[0].nodeIds).toEqual(['a', 'b', 'c']);
    expect(groups[0].layers.map(l => l.recipeId)).toEqual(['demandGrowth', 'carbonCap', 'costSensitivity']);
  });

  it('separates independent nodes into separate groups', () => {
    const nodes = [node('a', 'demandGrowth'), node('b', 'carbonCap'), node('c', 'costSensitivity')];
    const edges = [edge('a', 'b')]; // a→b is one group; c is its own
    const groups = deriveGroups(nodes, edges);
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.nodeIds.includes('c')).nodeIds).toEqual(['c']);
    expect(groups.find(g => g.nodeIds.includes('a')).nodeIds).toEqual(['a', 'b']);
  });

  it('flags a SPORES group', () => {
    const nodes = [node('s', 'spores')];
    const groups = deriveGroups(nodes, []);
    expect(groups[0].isSpores).toBe(true);
  });

  it('groupForNode finds the owning group', () => {
    const nodes = [node('a', 'demandGrowth'), node('b', 'carbonCap')];
    const groups = deriveGroups(nodes, [edge('a', 'b')]);
    expect(groupForNode(groups, 'b').head).toBe('a');
    expect(groupForNode(groups, 'zzz')).toBeNull();
  });
});
