import { describe, it, expect } from 'vitest';
import { normalizeError, classifyFromSignal, type ErrorCategory } from './agentRuntimeApi';

describe('classifyFromSignal', () => {
  it('5xx status → service_unavailable', () => {
    expect(classifyFromSignal(503, '')).toBe('service_unavailable');
  });
  it('4xx status → bad_request', () => {
    expect(classifyFromSignal(401, '')).toBe('bad_request');
  });
  it('service keyword in text → service_unavailable', () => {
    expect(classifyFromSignal(null, 'No available accounts')).toBe('service_unavailable');
  });
  it('network keyword in text → network', () => {
    expect(classifyFromSignal(null, 'connection refused')).toBe('network');
  });
  it('unknown → internal', () => {
    expect(classifyFromSignal(null, 'random')).toBe('internal');
  });
});

describe('normalizeError', () => {
  it('prefers explicit category from JSON body', () => {
    const e = normalizeError({ ok: false, status: 500, bodyText: '{"detail":"boom","category":"network"}' });
    expect(e.category).toBe('network');
    expect(e.detail).toBe('boom');
    expect(e.message).toBe('网络连接失败,请检查网络后重试');
  });
  it('falls back to status when body has no category', () => {
    const e = normalizeError({ ok: false, status: 503, bodyText: 'upstream gone' });
    expect(e.category).toBe('service_unavailable');
    expect(e.detail).toBe('upstream gone');
  });
  it('uses SSE event category when present', () => {
    const e = normalizeError({ sseError: 'boom', sseCategory: 'bad_request' });
    expect(e.category).toBe('bad_request');
  });
  it('fetch failure → network', () => {
    const e = normalizeError({ fetchError: 'failed to fetch' });
    expect(e.category).toBe('network');
  });
});
