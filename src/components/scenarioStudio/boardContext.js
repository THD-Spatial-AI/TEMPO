import { createContext } from 'react';

/**
 * Shared board state read by the custom card nodes (mirrors DiagramCtx in
 * CCSFlowDiagram.jsx). Provided by ScenarioStudio; consumed by RecipeCardNode.
 *
 * value: {
 *   model,                       // selected base model (for face summaries)
 *   selectedNodeId,              // currently selected node
 *   metaByNode: Map<id, {        // per-node group-derived metadata
 *     isHead, isSpores, variantCount, isEligible, pathwayMode, chainPos, chainLen
 *   }>,
 *   pathwayProgress,             // { nodeId: { variantLabel: status } }
 *   sporesEngineOk,              // engine === calliope06
 *   onTogglePathway,             // (headNodeId, boolean) => void
 *   onDeleteNode,                // (nodeId) => void
 * }
 */
export const BoardCtx = createContext(null);
