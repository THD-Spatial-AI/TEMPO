import { createContext } from 'react';

/**
 * Shared board state read by the canvas nodes/edges.
 *
 * value: {
 *   selectedNodeId,   // currently selected node id
 *   onDeleteNode,     // (nodeId) => void
 *   onDuplicateNode,  // (nodeId) => void
 *   onSetYear,        // (nodeId, year:number) => void   (Year nodes)
 *   onResizeYear,     // (nodeId, {width,height}) => void (manual resize)
 *   onDeleteEdge,     // (edgeId) => void
 *   onAddConfigToYear,// (yearId, category) => void  (nest a config in a year)
 * }
 */
export const BoardCtx = createContext(null);
