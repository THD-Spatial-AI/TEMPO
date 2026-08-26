// AIAnalysisTab — the "AI Analysis" result tab.
// Auto-generates a structured report for the selected run and lets the user
// chat about it, powered by the user's own API key (configured in Settings).
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  FiCpu, FiSend, FiRefreshCw, FiStopCircle, FiSettings, FiAlertTriangle, FiSliders,
} from 'react-icons/fi';
import { streamAI, aiAvailable, hasKey } from '../../../services/aiClient';
import { buildResultContextString, summarizeResult, summarizeModelInputs, estimateTokens } from '../../../services/aiContext';
import { SYSTEM_PROMPT, buildReportMessages, buildChatMessages } from '../../../services/aiPrompts';
import { getAIConfig, providerMeta } from '../../../services/aiSettings';

// ── Minimal markdown → React (headings, bold, bullets) — avoids a new dep ─────
function renderMarkdown(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let bullets = null;
  const flush = () => { if (bullets) { out.push(<ul key={`ul${out.length}`} className="list-disc pl-5 space-y-1 my-2">{bullets}</ul>); bullets = null; } };
  const inline = (s) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**'))
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{p}</React.Fragment>);
  };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (/^#{1,6}\s/.test(line)) {
      flush();
      const level = line.match(/^#+/)[0].length;
      const txt = line.replace(/^#+\s/, '');
      const cls = level <= 2 ? 'text-sm font-bold text-slate-800 mt-3 mb-1' : 'text-xs font-semibold text-slate-700 mt-2 mb-1';
      out.push(<div key={i} className={cls}>{inline(txt)}</div>);
    } else if (/^\s*[-*]\s/.test(line)) {
      (bullets = bullets || []).push(<li key={i} className="text-sm text-slate-600 leading-relaxed">{inline(line.replace(/^\s*[-*]\s/, ''))}</li>);
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      out.push(<p key={i} className="text-sm text-slate-600 leading-relaxed my-1">{inline(line)}</p>);
    }
  });
  flush();
  return out;
}

export default function AIAnalysisTab({ result, selectedJob, model, onOpenSettings }) {
  const modelName = selectedJob?.modelName || 'model';

  // ── Config / key gating ─────────────────────────────────────────────────
  // Config is read once on mount; the tab is remounted (keyed on the run id) by
  // the parent when the selected run changes, so no reset effect is needed.
  const [keyReady, setKeyReady] = useState(null); // null=checking, bool otherwise
  const [cfg] = useState(() => getAIConfig());
  useEffect(() => {
    let alive = true;
    hasKey().then((r) => { if (alive) setKeyReady(r); }).catch(() => { if (alive) setKeyReady(false); });
    return () => { alive = false; };
  }, []);

  // ── Context cap controls ────────────────────────────────────────────────
  const [includeDispatch, setIncludeDispatch] = useState(true);
  const [dispatchStride, setDispatchStride] = useState(1);
  const [topNKeys, setTopNKeys] = useState(0); // 0 = all
  const [includeInputs, setIncludeInputs] = useState(true);
  const [showControls, setShowControls] = useState(false);

  const summary = useMemo(() => summarizeResult(result), [result]);
  const inputsDigestFull = useMemo(() => summarizeModelInputs(model), [model]);
  const inputsDigest = includeInputs ? inputsDigestFull : '';
  const contextJson = useMemo(
    () => buildResultContextString(result, {
      includeDispatch,
      dispatchStride: Math.max(1, dispatchStride),
      topNKeys: topNKeys > 0 ? topNKeys : null,
    }),
    [result, includeDispatch, dispatchStride, topNKeys],
  );
  const tokens = useMemo(
    () => estimateTokens(contextJson) + estimateTokens(summary) + estimateTokens(inputsDigest) + estimateTokens(SYSTEM_PROMPT),
    [contextJson, summary, inputsDigest],
  );
  const heavy = tokens > 100_000;

  // ── Report state ────────────────────────────────────────────────────────
  const [report, setReport] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportErr, setReportErr] = useState('');
  const reportHandle = useRef(null);

  const runReport = useCallback(() => {
    setReport(''); setReportErr(''); setReportBusy(true);
    reportHandle.current = streamAI({
      system: SYSTEM_PROMPT,
      messages: buildReportMessages(summary, contextJson, modelName, inputsDigest),
      maxTokens: 4096,
      onDelta: (t) => setReport((r) => r + t),
      onDone: () => setReportBusy(false),
      onError: (e) => { setReportErr(e); setReportBusy(false); },
      onAbort: () => setReportBusy(false),
    });
  }, [summary, contextJson, modelName, inputsDigest]);

  // ── Chat state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatHandle = useRef(null);
  const threadRef = useRef(null);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }); }, [messages]);

  const sendChat = useCallback(() => {
    const q = input.trim();
    if (!q || chatBusy) return;
    const history = messages.slice();
    setMessages((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setInput('');
    setChatBusy(true);
    chatHandle.current = streamAI({
      system: SYSTEM_PROMPT,
      messages: buildChatMessages(summary, contextJson, modelName, history, q, inputsDigest),
      maxTokens: 2048,
      onDelta: (t) => setMessages((m) => {
        const next = m.slice();
        next[next.length - 1] = { role: 'assistant', content: next[next.length - 1].content + t };
        return next;
      }),
      onDone: () => setChatBusy(false),
      onError: (e) => { setMessages((m) => { const n = m.slice(); n[n.length - 1] = { role: 'assistant', content: `⚠ ${e}` }; return n; }); setChatBusy(false); },
      onAbort: () => setChatBusy(false),
    });
  }, [input, chatBusy, messages, summary, contextJson, modelName, inputsDigest]);

  // Cancel any in-flight request on unmount / run switch
  useEffect(() => () => { reportHandle.current?.cancel(); chatHandle.current?.cancel(); }, []);

  // ── Empty / gated states ────────────────────────────────────────────────
  if (!aiAvailable()) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center text-slate-400">
        <FiCpu size={40} className="mx-auto mb-3 opacity-20" />
        <p className="text-sm">Model Advisor is only available in the TEMPO desktop app.</p>
      </div>
    );
  }

  const meta = providerMeta(cfg.provider);

  if (keyReady === false) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
        <FiCpu size={40} className="mx-auto mb-3 text-slate-300" />
        <h3 className="text-lg font-semibold text-slate-700 mb-1">No API key configured</h3>
        <p className="text-sm text-slate-500 mb-5 max-w-md mx-auto">
          Model Advisor uses your own {meta.label} API key. Add one in Settings → Model Advisor. Your
          key is stored encrypted on this device; results are sent to your chosen provider only.
        </p>
        <button
          onClick={() => onOpenSettings?.()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gray-700 hover:bg-gray-800 transition-colors"
        >
          <FiSettings size={14} /> Open Model Advisor settings
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Context budget + cap controls ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <FiCpu size={15} className="text-gray-500" />
            <span className="font-semibold text-slate-700">{meta.label}</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-xs text-slate-500">{cfg.model || meta.defaultModel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${heavy ? 'text-amber-600' : 'text-slate-500'}`}>
              ~{tokens.toLocaleString()} tokens of context
            </span>
            <button
              onClick={() => setShowControls((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                showControls ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <FiSliders size={11} /> Data sent
            </button>
          </div>
        </div>

        {heavy && (
          <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            <FiAlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>Large context (~{tokens.toLocaleString()} tokens) may exceed your model's window or be costly. Use “Data sent” to downsample dispatch or cap to the top-N keys.</span>
          </div>
        )}

        {showControls && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={includeDispatch} onChange={(e) => setIncludeDispatch(e.target.checked)} className="rounded text-gray-600" />
              Include dispatch timeseries
            </label>
            <div className="text-xs text-slate-600">
              <label className="block mb-1">Dispatch downsample: every {dispatchStride}</label>
              <input type="range" min="1" max="24" value={dispatchStride} onChange={(e) => setDispatchStride(+e.target.value)} disabled={!includeDispatch} className="w-full" />
            </div>
            <div className="text-xs text-slate-600">
              <label className="block mb-1">Cap keys: {topNKeys > 0 ? `top ${topNKeys}` : 'all'}</label>
              <input type="range" min="0" max="200" step="10" value={topNKeys} onChange={(e) => setTopNKeys(+e.target.value)} className="w-full" />
            </div>
            <label className={`flex items-center gap-2 text-xs ${inputsDigestFull ? 'text-slate-600' : 'text-slate-300'}`}>
              <input type="checkbox" checked={includeInputs} disabled={!inputsDigestFull} onChange={(e) => setIncludeInputs(e.target.checked)} className="rounded text-gray-600" />
              Include model input assumptions{inputsDigestFull ? '' : ' (unavailable)'}
            </label>
          </div>
        )}
      </div>

      {/* ── Auto report ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
          <FiCpu size={14} className="text-gray-600" />
          <span className="font-semibold text-slate-800 text-sm flex-1">Model Advisor</span>
          {reportBusy ? (
            <button onClick={() => reportHandle.current?.cancel()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50">
              <FiStopCircle size={12} /> Stop
            </button>
          ) : (
            <button onClick={runReport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gray-700 hover:bg-gray-800">
              <FiRefreshCw size={12} /> {report ? 'Regenerate' : 'Generate report'}
            </button>
          )}
        </div>
        <div className="px-5 py-4">
          {reportErr && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <FiAlertTriangle size={14} className="mt-0.5 shrink-0" /> {reportErr}
            </div>
          )}
          {!report && !reportBusy && !reportErr && (
            <p className="text-sm text-slate-400 text-center py-8">
              Generate a plain-language report of what the solver decided, the key trade-offs, and recommendations.
            </p>
          )}
          {(report || reportBusy) && (
            <div className="prose-sm max-w-none">
              {renderMarkdown(report)}
              {reportBusy && <span className="inline-block w-2 h-4 bg-slate-400 animate-pulse align-middle ml-0.5" />}
            </div>
          )}
        </div>
      </div>

      {/* ── Chat ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-slate-100 font-semibold text-slate-800 text-sm">Ask about this run</div>
        <div ref={threadRef} className="max-h-96 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">e.g. “Why is gas capacity so low?” · “Which region is most expensive and why?”</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === 'user' ? 'bg-gray-700 text-white' : 'bg-slate-50 border border-slate-200'}`}>
                {m.role === 'user'
                  ? <span className="text-sm whitespace-pre-wrap">{m.content}</span>
                  : (m.content ? <div className="prose-sm max-w-none">{renderMarkdown(m.content)}</div>
                              : <span className="inline-block w-2 h-4 bg-slate-400 animate-pulse" />)}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 p-3 flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            placeholder="Ask a question about these results…"
            className="flex-1 resize-none px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 max-h-32"
          />
          {chatBusy ? (
            <button onClick={() => chatHandle.current?.cancel()} className="p-2.5 rounded-xl text-slate-600 border border-slate-200 hover:bg-slate-50" title="Stop">
              <FiStopCircle size={16} />
            </button>
          ) : (
            <button onClick={sendChat} disabled={!input.trim()} className="p-2.5 rounded-xl text-white bg-gray-700 hover:bg-gray-800 disabled:opacity-40" title="Send">
              <FiSend size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
