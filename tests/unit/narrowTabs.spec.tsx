import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';

describe('Narrow-screen tabs (SPEC §17.1, §17.2, §17.3)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  const cleanMasterInfo = '# Jordan Smith\nSenior Data Analyst\nSQL and Python experience.';

  const makeAnthropicStream = (text: string): string => {
    return [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '',
      'event: content_block_delta',
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}`,
      '',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":10}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
      '',
    ].join('\n');
  };

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();

    storage.set('masterInfo', { text: cleanMasterInfo, updatedAt: new Date().toISOString() });
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      paperSize: 'letter',
      theme: 'system',
      showAllModels: false,
    });
    storage.set('apiKeys', { anthropic: fakeKey, gemini: '' });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('supports clicking between Inputs and Outputs tabs', () => {
    const { container } = render(<App />);

    const inputsTab = screen.getByRole('tab', { name: /^inputs$/i });
    const outputsTab = screen.getByRole('tab', { name: /^outputs/i });
    const inputsPanel = container.querySelector('#inputs-panel');
    const outputsPanel = container.querySelector('#outputs-panel');

    // Initially Inputs is active
    expect(inputsTab.getAttribute('aria-selected')).toBe('true');
    expect(inputsTab.getAttribute('tabIndex')).toBe('0');
    expect(outputsTab.getAttribute('aria-selected')).toBe('false');
    expect(outputsTab.getAttribute('tabIndex')).toBe('-1');
    expect(inputsPanel?.classList.contains('hidden')).toBe(false);
    expect(outputsPanel?.classList.contains('hidden')).toBe(true);

    // Click Outputs
    fireEvent.click(outputsTab);

    expect(inputsTab.getAttribute('aria-selected')).toBe('false');
    expect(inputsTab.getAttribute('tabIndex')).toBe('-1');
    expect(outputsTab.getAttribute('aria-selected')).toBe('true');
    expect(outputsTab.getAttribute('tabIndex')).toBe('0');
    expect(inputsPanel?.classList.contains('hidden')).toBe(true);
    expect(outputsPanel?.classList.contains('hidden')).toBe(false);

    // Click Inputs back
    fireEvent.click(inputsTab);
    expect(inputsTab.getAttribute('aria-selected')).toBe('true');
    expect(outputsTab.getAttribute('aria-selected')).toBe('false');
  });

  it('supports keyboard operation of the tablist (Arrow keys, Home, End, roving tabIndex)', () => {
    render(<App />);

    const inputsTab = screen.getByRole('tab', { name: /^inputs$/i });
    const outputsTab = screen.getByRole('tab', { name: /^outputs/i });

    inputsTab.focus();
    expect(document.activeElement).toBe(inputsTab);

    // Press ArrowRight -> switch to Outputs
    fireEvent.keyDown(inputsTab, { key: 'ArrowRight' });
    expect(outputsTab.getAttribute('aria-selected')).toBe('true');
    expect(outputsTab.getAttribute('tabIndex')).toBe('0');
    expect(inputsTab.getAttribute('tabIndex')).toBe('-1');
    expect(document.activeElement).toBe(outputsTab);

    // Press ArrowLeft -> switch back to Inputs
    fireEvent.keyDown(outputsTab, { key: 'ArrowLeft' });
    expect(inputsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(inputsTab);

    // Press End -> jump to Outputs
    fireEvent.keyDown(inputsTab, { key: 'End' });
    expect(outputsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(outputsTab);

    // Press Home -> jump to Inputs
    fireEvent.keyDown(outputsTab, { key: 'Home' });
    expect(inputsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(inputsTab);
  });

  it('automatically switches to Outputs when Send is pressed and shows generating dot', async () => {
    let resolveStream: () => void = () => {};
    const streamPromise = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    const encoder = new TextEncoder();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        const stream = new ReadableStream({
          async start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}\n\n' +
                'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
                'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Generating..."}}\n\n',
              ),
            );
            await streamPromise;
            controller.enqueue(
              encoder.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'),
            );
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const { container } = render(<App />);

    // Unselect Cover Letter so only Resume runs
    fireEvent.click(screen.getByRole('button', { name: /cover letter/i }));

    const inputsTab = screen.getByRole('tab', { name: /^inputs$/i });
    const outputsTab = screen.getByRole('tab', { name: /^outputs/i });
    const inputsPanel = container.querySelector('#inputs-panel');
    const outputsPanel = container.querySelector('#outputs-panel');

    // Currently on Inputs tab
    expect(inputsTab.getAttribute('aria-selected')).toBe('true');

    // Click Send
    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    fireEvent.click(sendBtn);

    // UI switches to Outputs automatically
    await waitFor(() => {
      expect(outputsTab.getAttribute('aria-selected')).toBe('true');
      expect(inputsPanel?.classList.contains('hidden')).toBe(true);
      expect(outputsPanel?.classList.contains('hidden')).toBe(false);
    });

    // Outputs tab shows generating dot while generating
    expect(screen.getByText('(generating)')).toBeTruthy();

    resolveStream();
  });
});
