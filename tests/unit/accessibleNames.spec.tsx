import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useState } from 'react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { CustomInstructions } from '../../src/ui/inputs/CustomInstructions';
import { HelpPage } from '../../src/ui/help/HelpPage';
import { SettingsSheet } from '../../src/ui/settings/SettingsSheet';
import { SettingsProvider } from '../../src/state/SettingsContext';
import { MasterInfoProvider, useMasterInfo } from '../../src/state/MasterInfoContext';
import { InstructionsProvider, useInstructions } from '../../src/state/InstructionsContext';
import { JobProvider } from '../../src/state/JobContext';

describe('Accessible names and dangling references (SPEC §17.7, B9)', () => {
  const fakeKey = 'sk-' + 'test-fake-0000';
  const cleanMasterInfo = '# Jordan Sample\nData Analyst\nSQL and Python experience.';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = '#/';
    window.innerWidth = 1200;
    vi.restoreAllMocks();

    storage.set('masterInfo', {
      text: cleanMasterInfo,
      updatedAt: new Date().toISOString(),
    });
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: true,
      theme: 'system',
      paperSize: 'letter',
      showAllModels: false,
    });
    storage.set('apiKeys', { anthropic: fakeKey, gemini: '' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('3a. CustomInstructions textarea accessible name', () => {
    it('getByLabelText finds the textarea via the existing visible label text', () => {
      render(
        <JobProvider>
          <CustomInstructions />
        </JobProvider>
      );

      const textarea = screen.getByLabelText(/custom instructions \(this job only\)/i);
      expect(textarea).toBeTruthy();
      expect(textarea.tagName.toLowerCase()).toBe('textarea');
    });
  });

  describe('3b. Theme label and group in SettingsSheet Appearance tab', () => {
    it('has no label referencing a missing id, and the group is found by role with name "Theme"', () => {
      const { container } = render(
        <SettingsProvider>
          <MasterInfoProvider>
            <InstructionsProvider>
              <SettingsSheet open={true} onOpenChange={() => {}} />
            </InstructionsProvider>
          </MasterInfoProvider>
        </SettingsProvider>
      );

      // Switch to Appearance tab
      const appearanceTab = screen.getByRole('tab', { name: /^Appearance$/i });
      fireEvent.keyDown(appearanceTab, { key: 'Enter', code: 'Enter' });
      fireEvent.click(appearanceTab);

      // Verify group with name "Theme" exists
      const themeGroup = screen.getByRole('group', { name: 'Theme' });
      expect(themeGroup).toBeTruthy();

      // Verify no label in Appearance references a missing id
      const labels = document.querySelectorAll('label');
      expect(labels.length).toBeGreaterThan(0);
      for (const label of Array.from(labels)) {
        if (label.htmlFor) {
          const target = document.getElementById(label.htmlFor);
          expect(target).not.toBeNull();
        }
      }
    });
  });

  describe('3c. HelpPage interactive nesting', () => {
    it('contains no <button> inside an <a> and the link navigates to #/', () => {
      const { container } = render(<HelpPage />);

      const nestedButtons = container.querySelectorAll('a button');
      expect(nestedButtons.length).toBe(0);

      const backLink = screen.getByRole('link', { name: /back to drafts/i });
      expect(backLink).toBeTruthy();
      expect(backLink.getAttribute('href')).toBe('#/');
    });
  });

  describe('3d. Unsaved indicator dots accessible name in SettingsSheet', () => {
    it('tab trigger accessible name contains "(unsaved changes)" when dirty and not when clean', () => {
      render(
        <SettingsProvider>
          <MasterInfoProvider>
            <InstructionsProvider>
              <SettingsSheet open={true} onOpenChange={() => {}} />
            </InstructionsProvider>
          </MasterInfoProvider>
        </SettingsProvider>
      );

      const masterTab = screen.getByRole('tab', { name: /^Master Info$/i });
      expect(masterTab.textContent).not.toContain('(unsaved changes)');

      const instTab = screen.getByRole('tab', { name: /^Instructions$/i });
      expect(instTab.textContent).not.toContain('(unsaved changes)');

      // Switch to Master Info tab and edit the draft
      fireEvent.keyDown(masterTab, { key: 'Enter', code: 'Enter' });
      fireEvent.click(masterTab);

      const masterTextarea = screen.getByRole('textbox', { name: /^Master Info$/i });
      fireEvent.change(masterTextarea, { target: { value: '# Modified Master Info' } });

      // Master Info trigger accessible name now contains "(unsaved changes)"
      const dirtyMasterTab = screen.getByRole('tab', { name: /Master Info.*\(unsaved changes\)/i });
      expect(dirtyMasterTab).toBeTruthy();
      expect(dirtyMasterTab.textContent).toContain('(unsaved changes)');

      // Instructions trigger still clean
      expect(screen.getByRole('tab', { name: /^Instructions$/i })).toBeTruthy();
      expect(screen.getByRole('tab', { name: /^Instructions$/i }).textContent).not.toContain('(unsaved changes)');

      // Switch to Instructions tab and edit the draft
      fireEvent.keyDown(instTab, { key: 'Enter', code: 'Enter' });
      fireEvent.click(instTab);

      const instTextarea = screen.getByRole('textbox', { name: /Instructions/i });
      fireEvent.change(instTextarea, { target: { value: '# Modified Instructions' } });

      const dirtyInstTab = screen.getByRole('tab', { name: /Instructions.*\(unsaved changes\)/i });
      expect(dirtyInstTab).toBeTruthy();
      expect(dirtyInstTab.textContent).toContain('(unsaved changes)');
    });
  });

  describe('3e. OutputTabs per-tab blocker aria-describedby', () => {
    function makeAnthropicStream(text: string) {
      const enc = new TextEncoder();
      const chunks = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet","stop_reason":null}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}\n\n`,
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ];
      return new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(enc.encode(c));
          controller.close();
        },
      });
    }

    it('when blocked, document.getElementById(describedById) exists and matches blocker message; when unblocked, aria-describedby is absent', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (url: string) => {
          if (typeof url === 'string' && url.includes('/models')) {
            return new Response(
              JSON.stringify({
                data: [
                  {
                    id: 'claude-3-5-sonnet',
                    display_name: 'Claude 3.5 Sonnet',
                  },
                ],
              }),
              { status: 200 }
            );
          }
          return new Response(makeAnthropicStream('Generated answers draft.'), {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        })
      );

      render(<App />);

      // Unselect Resume and Cover Letter, select Application Answers
      fireEvent.click(screen.getByRole('button', { name: /^Resume$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^Cover Letter$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^Application Answers$/i }));

      // Enter questions so send is unblocked
      const questionsInput = screen.getByLabelText(/Application questions/i);
      fireEvent.change(questionsInput, { target: { value: '1. Tell me about your experience with SQL.' } });

      // Send
      const sendButton = screen.getByRole('button', { name: /^Send$/i });
      fireEvent.click(sendButton);

      // Wait for generation to finish and Regenerate button to appear
      const regenerateButton = await screen.findByRole('button', { name: /^Regenerate$/i });
      expect(regenerateButton).toBeTruthy();

      // Initially unblocked: aria-describedby should be absent
      expect(regenerateButton.getAttribute('aria-describedby')).toBeNull();

      // Clear questions to trigger blocker on Answers tab
      fireEvent.change(questionsInput, { target: { value: '' } });

      // Regenerate is now disabled / blocked
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Regenerate$/i }).hasAttribute('disabled')).toBe(true);
      });

      const blockedRegenButton = screen.getByRole('button', { name: /^Regenerate$/i });
      const describedById = blockedRegenButton.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();
      expect(describedById).toBe('tab-blocker-reason-ANSWERS');

      const blockerEl = document.getElementById(describedById!);
      expect(blockerEl).not.toBeNull();
      expect(blockerEl?.textContent).toBe('Add the application questions: paste them, or attach a screenshot or file that contains them.');
      expect(blockerEl?.classList.contains('sr-only')).toBe(true);
      // Must not be a live region
      expect(blockerEl?.getAttribute('aria-live')).toBeNull();
      expect(blockerEl?.getAttribute('role')).toBeNull();

      // Restore questions: unblocked again
      fireEvent.change(questionsInput, { target: { value: '1. Tell me about your experience with SQL.' } });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Regenerate$/i }).hasAttribute('disabled')).toBe(false);
      });
      expect(screen.getByRole('button', { name: /^Regenerate$/i }).getAttribute('aria-describedby')).toBeNull();
    });
  });
});
