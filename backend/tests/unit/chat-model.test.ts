import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { AnthropicChatModel } from '../../src/infrastructure/shared/anthropic-chat-model';
import { MemoryRateLimiter } from '../../src/infrastructure/shared/memory-rate-limiter';
import type { Logger } from '../../src/application/ports';

function recordingLogger() {
  const lines: string[] = [];
  const log = (level: string) => (m: string, f?: Record<string, unknown>) => lines.push(JSON.stringify({ level, m, ...f }));
  const logger: Logger = { info: log('info'), warn: log('warn'), error: log('error') };
  return { logger, lines };
}

function clientReturning(response: unknown, capture: { body?: Record<string, unknown> }) {
  return {
    beta: {
      messages: {
        create: async (body: Record<string, unknown>) => {
          capture.body = body;
          if (response instanceof Error) throw response;
          return response;
        },
      },
    },
  } as unknown as Anthropic;
}

const input = {
  messages: [{ role: 'user' as const, content: 'SECRET-QUESTION how do I create an invoice' }],
  pages: [{ id: 'w/s/create-an-invoice', title: 'Create an invoice', href: '/w/s/create-an-invoice/', text: 'Steps' }],
  supportUrl: 'https://help.example.com',
};

describe('AnthropicChatModel', () => {
  it('sends the recommended model with refusal fallback, structured output and the pages', async () => {
    const capture: { body?: Record<string, unknown> } = {};
    const { logger, lines } = recordingLogger();
    const response = { stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: '{"answer":"1. Open Sales.","usedPageIds":["w/s/create-an-invoice"]}' }] };
    const model = new AnthropicChatModel({ apiKey: 'sk-test-KEY', model: 'claude-opus-5-5', logger, client: clientReturning(response, capture) });
    expect(await model.answer(input)).toEqual({ answer: '1. Open Sales.', usedPageIds: ['w/s/create-an-invoice'] });
    expect(capture.body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect(String(capture.body?.system)).toContain('<page id="w/s/create-an-invoice"');
    expect(String(capture.body?.system)).toContain('https://help.example.com');
    // Never logs the conversation or the key.
    expect(lines.join('\n')).not.toMatch(/SECRET-QUESTION|sk-test-KEY/);
  });

  it('turns a refusal into a polite answer', async () => {
    const model = new AnthropicChatModel({ apiKey: 'k', model: 'm', logger: recordingLogger().logger, client: clientReturning({ stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 }, content: [] }, {}) });
    expect((await model.answer(input)).usedPageIds).toEqual([]);
  });

  it('maps API failures to typed errors without leaking details', async () => {
    const make = (err: Error) => new AnthropicChatModel({ apiKey: 'k', model: 'm', logger: recordingLogger().logger, client: clientReturning(err, {}) });
    const headers = new Headers();
    await expect(make(new Anthropic.RateLimitError(429, undefined, 'slow down', headers)).answer(input)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(make(new Anthropic.AuthenticationError(401, undefined, 'bad key sk-test', headers)).answer(input)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await expect(make(new Anthropic.InternalServerError(500, undefined, 'boom', headers)).answer(input)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    await expect(make(new Error('network down')).answer(input)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });

  it('refuses unparsable output', async () => {
    const model = new AnthropicChatModel({ apiKey: 'k', model: 'm', logger: recordingLogger().logger, client: clientReturning({ stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: '{"answer": "cut' }] }, {}) });
    await expect(model.answer(input)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });
});

describe('MemoryRateLimiter', () => {
  it('allows the limit per window, per key', () => {
    let t = 0;
    const rl = new MemoryRateLimiter(2, 1000, () => t);
    expect([rl.take('a'), rl.take('a'), rl.take('a'), rl.take('b')]).toEqual([true, true, false, true]);
    t = 1000;
    expect(rl.take('a')).toBe(true);
  });
});
