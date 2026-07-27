import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildReportMessages, buildChatMessages } from '../aiPrompts.js';

describe('SYSTEM_PROMPT', () => {
  it('is a non-trivial analyst prompt', () => {
    expect(SYSTEM_PROMPT).toMatch(/energy/i);
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(200);
  });
});

describe('buildReportMessages', () => {
  it('embeds the summary + raw context and asks for the three sections', () => {
    const [msg] = buildReportMessages('SUMMARY: renewable share 80%', '{"objective":1}', 'Chile North');
    expect(msg.role).toBe('user');
    expect(msg.content).toContain('Chile North');
    expect(msg.content).toContain('SUMMARY: renewable share 80%');
    expect(msg.content).toContain('{"objective":1}');
    expect(msg.content).toContain('## Situation');
    expect(msg.content).toContain('## Key decisions the solver made');
    expect(msg.content).toContain('## Recommendations');
  });
});

describe('buildChatMessages', () => {
  it('embeds summary + context first, then history, then the new question', () => {
    const history = [
      { role: 'user', content: 'prior q' },
      { role: 'assistant', content: 'prior a' },
    ];
    const msgs = buildChatMessages('SUM', '{"x":1}', 'M', history, 'why so much solar?');
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toContain('SUM');
    expect(msgs[0].content).toContain('{"x":1}');
    expect(msgs[1].role).toBe('assistant'); // context ack
    expect(msgs.slice(2, 4)).toEqual(history);
    const last = msgs[msgs.length - 1];
    expect(last).toEqual({ role: 'user', content: 'why so much solar?' });
  });

  it('works with empty history', () => {
    const msgs = buildChatMessages('SUM', '{}', 'M', [], 'q');
    expect(msgs[msgs.length - 1].content).toBe('q');
    expect(msgs.every(m => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });
});
