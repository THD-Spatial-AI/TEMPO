// aiPrompts.js
// -------------------------------------------------------------------------
// System prompt + message builders for the Results AI assistant. Kept separate
// from transport (aiClient) and serialization (aiContext) so prompt wording can
// be tuned and unit-tested in isolation.
//
// Both builders lead with a PRE-COMPUTED summary (aiContext.summarizeResult) so
// even fast models are handed aggregated conclusions to explain, then the raw
// JSON contract for drill-down. This is what keeps reports specific and chat
// answers grounded in the actual run.

export const SYSTEM_PROMPT = [
  'You are an expert energy-systems analyst embedded in TEMPO, a tool for building and',
  'running energy-system optimization models (Calliope, PyPSA, OSeMOSYS, AdOpT-NET0).',
  'The user has solved an optimization. You are given (1) a PRE-COMPUTED SUMMARY of the',
  'result with headline aggregates AND diagnostics already calculated (capacity-factor flags,',
  'system adequacy, binding constraints from shadow prices, and available-but-unbuilt techs),',
  'and (2) the raw result JSON (capacities keyed loc::tech, generation, dispatch, costs).',
  'A MODEL INPUT ASSUMPTIONS block may also be present (per-technology cost inputs, potentials,',
  'efficiencies) — use it to critique the assumptions behind the result, not just the outcome.',
  '',
  'Rules:',
  '- Ground every statement in the provided data. The SUMMARY aggregates and its "Diagnostics',
  '  & flags" / "Binding constraints" sections are authoritative; use them for totals, shares,',
  '  and reasoning rather than re-deriving from raw JSON.',
  '- Be concrete and quantitative. Cite specific numbers with units (MW, MWh, €, %) and name',
  '  the actual technologies and locations from THIS run — never generic placeholders.',
  '- Explain WHY the solver made a choice (economics, capacity factors, costs, constraints),',
  '  not just WHAT it built. Point out trade-offs, outliers, and anything surprising.',
  '- Do NOT pad with textbook background or generic energy-transition advice. If the data does',
  '  not support a claim, say so. If asked something the data cannot answer, say what is missing.',
  '- Use clear markdown: short paragraphs, ## headings, - bullets. Lead with the answer.',
].join('\n');

/** Wrap the summary + optional input assumptions + raw context into the shared grounding block. */
function groundingBlock(summary, contextJson, modelName, inputsDigest) {
  return [
    `Model: ${modelName || 'unnamed model'}`,
    '',
    summary || '(no summary available)',
    ...(inputsDigest ? ['', inputsDigest] : []),
    '',
    'Raw result JSON (for drill-down; may be downsampled/capped):',
    '```json',
    contextJson,
    '```',
  ].join('\n');
}

/**
 * Messages for the one-shot structured report.
 * @param {string} summary       pre-computed digest (from aiContext.summarizeResult)
 * @param {string} contextJson   serialized raw result context
 * @param {string} modelName
 * @param {string} [inputsDigest] slim model-input assumptions (from aiContext.summarizeModelInputs)
 */
export function buildReportMessages(summary, contextJson, modelName, inputsDigest) {
  return [
    {
      role: 'user',
      content: [
        groundingBlock(summary, contextJson, modelName, inputsDigest),
        '',
        'Write a detailed, specific analysis of THIS result with exactly these sections:',
        '',
        '## Situation',
        'What was optimized and the system at a glance: scale, total cost/objective, and the',
        'headline capacity & generation mix — with the actual numbers and dominant technologies.',
        '',
        '## Key decisions the solver made',
        'The most important build and dispatch choices AND the economic/physical reasoning behind',
        'them: which technologies dominate and why (cost, capacity factor), where capacity and cost',
        'concentrate (name the top locations), how transmission/storage is used, and any outliers',
        'or surprises. Reference concrete figures throughout.',
        '',
        '## Recommendations',
        'Specific, actionable next steps grounded in the diagnostics. Prioritise: binding',
        'constraints worth relaxing (name the constraint and its shadow price), technologies',
        'flagged as over- or under-built (cite the capacity factor), adequacy gaps (unmet demand',
        'or oversupply/curtailment), and technologies the solver left unbuilt (say why, and what',
        'input would change that). Where the input assumptions block is available, cite the specific',
        'input param (e.g. energy_cap_max, energy_cap cost, resource) that drives the result and is',
        'worth revisiting. For EACH recommendation, name the specific metric or flag that motivates',
        'it and the concrete sensitivity or input to change. No generic energy advice.',
      ].join('\n'),
    },
  ];
}

/**
 * Messages for a chat turn. The grounding block is embedded once as the opening
 * user turn, followed by prior history and the new question.
 * @param {string} summary
 * @param {string} contextJson
 * @param {string} modelName
 * @param {Array<{role:'user'|'assistant',content:string}>} history
 * @param {string} question
 * @param {string} [inputsDigest] slim model-input assumptions (from aiContext.summarizeModelInputs)
 */
export function buildChatMessages(summary, contextJson, modelName, history, question, inputsDigest) {
  return [
    {
      role: 'user',
      content: [
        'You will answer questions about a specific optimization result. Base answers strictly on',
        'the data below and cite concrete numbers, technologies and locations from it.',
        '',
        groundingBlock(summary, contextJson, modelName, inputsDigest),
      ].join('\n'),
    },
    { role: 'assistant', content: 'Understood — I have this run\'s summary and raw results in front of me. What would you like to know?' },
    ...(history || []),
    { role: 'user', content: question },
  ];
}
