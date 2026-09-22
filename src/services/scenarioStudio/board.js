/**
 * Scenario Studio — sandbox board topology.
 *
 * The board is a React-Flow graph of recipe-card nodes joined by directed
 * "compose" wires. This module is framework-free (no React Flow imports) so it
 * can be unit-tested in isolation.
 *
 * Node  = { id, type:'recipeCard', position, data:{ recipeId, params, pathwayMode } }
 * Edge  = { id, source, target }   // source composes BEFORE target
 * Group = a weakly-connected component of the compose graph. Chains are LINEAR
 *         (each node ≤1 incoming and ≤1 outgoing edge), so a group is an ordered
 *         path; a lone node is a group of one.
 */

const isSpores = (node) => node?.data?.recipeId === 'spores';

// ─── connection validation ──────────────────────────────────────────────────────

/**
 * Can this connection be added while keeping every group a linear, acyclic chain?
 * Rejects: self-loops, edges touching a SPORES node, a source that already has an
 * outgoing edge or a target that already has an incoming edge, and cycles.
 *
 * @param {object[]} nodes
 * @param {object[]} edges
 * @param {{source:string, target:string}} connection
 * @returns {boolean}
 */
export function canConnect(nodes, edges, connection) {
  const { source, target } = connection || {};
  if (!source || !target || source === target) return false;

  const byId = new Map(nodes.map(n => [n.id, n]));
  const src = byId.get(source);
  const tgt = byId.get(target);
  if (!src || !tgt) return false;
  if (isSpores(src) || isSpores(tgt)) return false;

  // Linear: one outgoing per node, one incoming per node.
  if (edges.some(e => e.source === source)) return false;
  if (edges.some(e => e.target === target)) return false;

  // No cycle: target must not already reach source (following edge direction).
  if (reaches(edges, target, source)) return false;

  return true;
}

// Does `from` reach `to` by following directed edges?
function reaches(edges, from, to) {
  const out = new Map();
  edges.forEach(e => {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source).push(e.target);
  });
  const seen = new Set();
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === to) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    (out.get(cur) || []).forEach(n => stack.push(n));
  }
  return false;
}

// ─── group derivation ────────────────────────────────────────────────────────────

/**
 * Partition the board into scenario groups.
 *
 * @param {object[]} nodes
 * @param {object[]} edges
 * @returns {Array<{ id:string, nodeIds:string[], head:string, isSpores:boolean,
 *                    layers:Array<{recipeId:string, params:object}> }>}
 *          nodeIds/layers are in compose order (head first). Order matches the
 *          node array so a stable board yields stable group ids.
 */
export function deriveGroups(nodes, edges) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const outOf = new Map(); // source → target
  const inTo = new Map();  // target → source
  edges.forEach(e => {
    if (byId.has(e.source) && byId.has(e.target)) {
      outOf.set(e.source, e.target);
      inTo.set(e.target, e.source);
    }
  });

  const seen = new Set();
  const groups = [];

  for (const node of nodes) {
    if (seen.has(node.id)) continue;

    // Walk back to the chain head (node with no incoming edge in the chain).
    let head = node.id;
    const guard = new Set([head]);
    while (inTo.has(head) && !guard.has(inTo.get(head))) {
      head = inTo.get(head);
      guard.add(head);
    }

    // Walk forward from the head collecting the ordered chain.
    const nodeIds = [];
    let cur = head;
    const fguard = new Set();
    while (cur != null && !fguard.has(cur)) {
      fguard.add(cur);
      seen.add(cur);
      nodeIds.push(cur);
      cur = outOf.get(cur);
    }

    const layers = nodeIds.map(id => {
      const d = byId.get(id).data || {};
      return { recipeId: d.recipeId, params: d.params || {} };
    });

    groups.push({
      id: head,
      nodeIds,
      head,
      isSpores: isSpores(byId.get(head)),
      layers,
    });
  }

  return groups;
}

/** The group a given node belongs to (or null). */
export function groupForNode(groups, nodeId) {
  return groups.find(g => g.nodeIds.includes(nodeId)) || null;
}
