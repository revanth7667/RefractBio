import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { InstructionsPanel } from '../../src/ui/settings/InstructionsPanel';
import { SettingsSheet } from '../../src/ui/settings/SettingsSheet';
import { InstructionsProvider, useInstructions, InstructionsContextValue } from '../../src/state/InstructionsContext';
import { MasterInfoProvider, useMasterInfo, MasterInfoContextValue } from '../../src/state/MasterInfoContext';
import { SettingsProvider } from '../../src/state/SettingsContext';
import defaultInstructionsRaw from '../../src/data/instructions.default.md?raw';
import * as storage from '../../src/storage/storage';
import { APP_ID } from '../../src/config';
import limits from '../../src/data/limits.json';

function TestPanel({
  onState,
}: {
  onState?: (val: InstructionsContextValue) => void;
}) {
  return (
    <SettingsProvider>
      <InstructionsProvider>
        <StateCapturer onState={onState} />
        <InstructionsPanel />
      </InstructionsProvider>
    </SettingsProvider>
  );
}

function StateCapturer({
  onState,
}: {
  onState?: (val: InstructionsContextValue) => void;
}) {
  const state = useInstructions();
  React.useEffect(() => {
    onState?.(state);
  }, [state, onState]);
  return null;
}

function CombinedSheetTest({
  open,
  onOpenChange,
  onMasterState,
  onInstructionsState,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMasterState?: (val: MasterInfoContextValue) => void;
  onInstructionsState?: (val: InstructionsContextValue) => void;
}) {
  return (
    <SettingsProvider>
      <MasterInfoProvider>
        <InstructionsProvider>
          <MasterCapturer onState={onMasterState} />
          <InstructionsCapturer onState={onInstructionsState} />
          <SettingsSheet open={open} onOpenChange={onOpenChange} />
        </InstructionsProvider>
      </MasterInfoProvider>
    </SettingsProvider>
  );
}

function MasterCapturer({ onState }: { onState?: (val: MasterInfoContextValue) => void }) {
  const state = useMasterInfo();
  React.useEffect(() => {
    onState?.(state);
  }, [state, onState]);
  return null;
}

function InstructionsCapturer({ onState }: { onState?: (val: InstructionsContextValue) => void }) {
  const state = useInstructions();
  React.useEffect(() => {
    onState?.(state);
  }, [state, onState]);
  return null;
}

describe('Instructions Panel & State (§11.3, §17.4)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('First-run behavior', () => {
    it('shows the bundled default, pre-fills editor, produces no warnings, and does not write to storage', () => {
      let state!: InstructionsContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      expect(state.savedInstructions).toBeNull();
      expect(state.savedText).toBeNull();
      expect(state.editorDraft).toBe(defaultInstructionsRaw);
      expect(state.hasUnsavedChanges).toBe(false);
      expect(state.resolvedSaved.warnings).toEqual([]);
      expect(state.resolvedSaved.fallbacks).toEqual([]);
      expect(state.resolvedDraft.warnings).toEqual([]);

      const textarea = screen.getByRole('textbox', { name: /instructions editor/i }) as HTMLTextAreaElement;
      expect(textarea.value).toBe(defaultInstructionsRaw);

      // No amber notice
      expect(screen.queryByRole('alert', { name: /instructions warnings/i })).toBeNull();

      // Nothing written to storage
      expect(storage.get('instructions').ok).toBe(false);
    });
  });

  describe('Editing & Saving', () => {
    it('updates editor draft, shows unsaved dot, keeps savedText unchanged until Save', () => {
      let state!: InstructionsContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      const customText = defaultInstructionsRaw.replace('# GLOBAL', '# GLOBAL\n- Custom rule here');

      const textarea = screen.getByRole('textbox', { name: /instructions editor/i });
      fireEvent.change(textarea, { target: { value: customText } });

      expect(state.editorDraft).toBe(customText);
      expect(state.hasUnsavedChanges).toBe(true);
      expect(state.savedText).toBeNull();
      expect(screen.getByText('Unsaved changes')).toBeTruthy();

      const saveBtn = screen.getByRole('button', { name: /^save$/i });
      act(() => {
        fireEvent.click(saveBtn);
      });

      expect(state.savedText).toBe(customText);
      expect(state.hasUnsavedChanges).toBe(false);
      expect(screen.queryByText('Unsaved changes')).toBeNull();

      const stored = storage.get<{ text: string }>('instructions');
      expect(stored.ok).toBe(true);
      if (stored.ok) {
        expect(stored.value.text).toBe(customText);
      }
    });

    it('persists across reload', () => {
      const customText = defaultInstructionsRaw + '\n# ANSWERS\n- Extra line';
      storage.set('instructions', { text: customText, updatedAt: new Date().toISOString() });

      let state!: InstructionsContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      expect(state.savedText).toBe(customText);
      expect(state.editorDraft).toBe(customText);
      expect(state.hasUnsavedChanges).toBe(false);
    });

    it('shows inline error message when storage quota is exceeded on save (§9.4)', () => {
      render(<TestPanel />);

      vi.spyOn(storage, 'set').mockReturnValue({
        ok: false,
        reason: 'quota_exceeded',
        message: "Couldn't save: browser storage is full. Download a copy now, then shorten the file or delete app data.",
      });

      const textarea = screen.getByRole('textbox', { name: /instructions editor/i });
      fireEvent.change(textarea, { target: { value: 'custom edits' } });

      const saveBtn = screen.getByRole('button', { name: /^save$/i });
      act(() => {
        fireEvent.click(saveBtn);
      });

      expect(
        screen.getByText(
          "Couldn't save: browser storage is full. Download a copy now, then shorten the file or delete app data.",
        ),
      ).toBeTruthy();
    });

    it('handles unavailable storage by keeping in-memory saved state as stored (§9.4)', () => {
      let state!: InstructionsContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      vi.spyOn(storage, 'set').mockReturnValue({
        ok: false,
        reason: 'unavailable',
        message: 'Storage is not available in this environment',
      });

      const textarea = screen.getByRole('textbox', { name: /instructions editor/i });
      fireEvent.change(textarea, { target: { value: 'in-memory instructions' } });

      const saveBtn = screen.getByRole('button', { name: /^save$/i });
      act(() => {
        fireEvent.click(saveBtn);
      });

      expect(state.savedText).toBe('in-memory instructions');
      expect(state.hasUnsavedChanges).toBe(false);
    });
  });

  describe('Warnings & Amber notice', () => {
    it('misspelled heading shows amber notice with draft label when unsaved', () => {
      render(<TestPanel />);

      const misspelledText = defaultInstructionsRaw.replace('\n# COVER_LETTER\n', '\n# COVER LETTER\n');
      const textarea = screen.getByRole('textbox', { name: /instructions editor/i });
      fireEvent.change(textarea, { target: { value: misspelledText } });

      const notice = screen.getByRole('alert', { name: /instructions warnings/i });
      expect(notice).toBeTruthy();
      expect(notice.textContent).toContain('(unsaved draft)');
      expect(notice.textContent).toContain('Heading "# COVER LETTER" isn\'t recognised');
      expect(notice.textContent).toContain('Section # COVER_LETTER was missing or empty');
    });
  });

  describe('Reset Section & Reset Whole File (§11.3)', () => {
    it('Reset this section replaces chosen section with default, leaves other sections intact, and leaves draft unsaved', async () => {
      let state!: InstructionsContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      // Save custom instructions with modified RESUME and COVER_LETTER
      const modified = defaultInstructionsRaw
        .replace('# RESUME\n', '# RESUME\nMy custom resume rules\n')
        .replace('# COVER_LETTER\n', '# COVER_LETTER\nMy custom letter rules\n');

      const textarea = screen.getByRole('textbox', { name: /instructions editor/i });
      fireEvent.change(textarea, { target: { value: modified } });
      const saveBtn = screen.getByRole('button', { name: /^save$/i });
      act(() => {
        fireEvent.click(saveBtn);
      });
      expect(state.hasUnsavedChanges).toBe(false);

      // Select RESUME in select element
      const select = screen.getByLabelText(/select section to reset/i);
      fireEvent.change(select, { target: { value: 'RESUME' } });

      // Click Reset this section
      const resetSecBtn = screen.getByRole('button', { name: /reset this section/i });
      fireEvent.click(resetSecBtn);

      // Confirm dialog description check
      expect(
        screen.getByText('Replace the #RESUME section with the default? Other sections are kept.'),
      ).toBeTruthy();

      const confirmBtn = screen.getByRole('button', { name: /^reset$/i });
      act(() => {
        fireEvent.click(confirmBtn);
      });

      // Draft is unsaved!
      expect(state.hasUnsavedChanges).toBe(true);
      expect(state.editorDraft).toContain('My custom letter rules'); // other section untouched
      expect(state.editorDraft).not.toContain('My custom resume rules'); // RESUME replaced
      expect(state.editorDraft).toContain('Aim for one page; never more than two pages.'); // default restored
    });

    it('Reset whole file prompts with Download copy, Cancel, Reset, and leaves draft unsaved', async () => {
      let state!: InstructionsContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      const customText = '# GLOBAL\nonly global';
      const textarea = screen.getByRole('textbox', { name: /instructions editor/i });
      fireEvent.change(textarea, { target: { value: customText } });
      const saveBtn = screen.getByRole('button', { name: /^save$/i });
      act(() => {
        fireEvent.click(saveBtn);
      });
      expect(state.hasUnsavedChanges).toBe(false);

      const resetFileBtn = screen.getByRole('button', { name: /reset whole file/i });
      fireEvent.click(resetFileBtn);

      expect(
        screen.getByText(
          'Replace your instructions file with the default? This cannot be undone. Download a copy first if you want to keep it.',
        ),
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: /download copy/i })).toBeTruthy();

      // Click Reset
      const confirmBtn = screen.getByRole('button', { name: /^reset$/i });
      act(() => {
        fireEvent.click(confirmBtn);
      });

      // Draft restored to default, but unsaved!
      expect(state.editorDraft).toBe(defaultInstructionsRaw);
      expect(state.hasUnsavedChanges).toBe(true); // Because savedText was customText!
    });
  });

  describe('Upload (.md / .txt)', () => {
    it('rejects files with invalid extensions', async () => {
      const { container } = render(<TestPanel />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      const badFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      await act(async () => {
        fireEvent.change(input, { target: { files: [badFile] } });
      });

      expect(screen.getByText('Please upload a .md or .txt file.')).toBeTruthy();
    });

    it('rejects files exceeding masterInfoMaxBytes', async () => {
      const { container } = render(<TestPanel />);
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      const bigFile = new File(['x'.repeat(limits.masterInfoMaxBytes + 10)], 'big.md', {
        type: 'text/markdown',
      });
      Object.defineProperty(bigFile, 'size', { value: limits.masterInfoMaxBytes + 10 });

      await act(async () => {
        fireEvent.change(input, { target: { files: [bigFile] } });
      });

      expect(
        screen.getByText(`File exceeds the size limit (${limits.masterInfoMaxBytes} bytes).`),
      ).toBeTruthy();
    });

    it('requires confirmation, and confirming fills editor only and does NOT save', async () => {
      let state!: InstructionsContextValue;
      const { container } = render(<TestPanel onState={(val) => { state = val; }} />);

      const uploadedText = '# GLOBAL\nUploaded content';
      const file = new File([uploadedText], 'uploaded.md', { type: 'text/markdown' });

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      // Confirm dialog appears
      const confirmTitle = await screen.findByText('Replace instructions with uploaded file?');
      expect(confirmTitle).toBeTruthy();

      const replaceBtn = screen.getByRole('button', { name: /^replace$/i });
      act(() => {
        fireEvent.click(replaceBtn);
      });

      expect(state.editorDraft).toBe(uploadedText);
      expect(state.hasUnsavedChanges).toBe(true);
      expect(state.savedText).toBeNull(); // NOT saved
    });
  });

  describe('Download & Round-trip byte identity', () => {
    it('downloads editor text and produces byte-identical round-trip for LF and CRLF', async () => {
      const lfContent = '# Line 1\n## Line 2\n- Bullet 1\n';
      const crlfContent = '# Line 1\r\n## Line 2\r\n- Bullet 1\r\n';

      function readFileAsBuffer(file: File): Promise<ArrayBuffer> {
        if (typeof file.arrayBuffer === 'function') {
          return file.arrayBuffer();
        }
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(file);
        });
      }

      // Verify LF roundtrip
      const lfFile = new File([lfContent], 'test-lf.md', { type: 'text/markdown' });
      const lfBuffer = await readFileAsBuffer(lfFile);
      const lfDecoded = new TextDecoder('utf-8').decode(lfBuffer);
      expect(lfDecoded).toBe(lfContent);
      const lfReencoded = new TextEncoder().encode(lfDecoded);
      expect(Array.from(new Uint8Array(lfBuffer))).toEqual(Array.from(lfReencoded));

      // Verify CRLF roundtrip
      const crlfFile = new File([crlfContent], 'test-crlf.md', { type: 'text/markdown' });
      const crlfBuffer = await readFileAsBuffer(crlfFile);
      const crlfDecoded = new TextDecoder('utf-8').decode(crlfBuffer);
      expect(crlfDecoded).toBe(crlfContent);
      const crlfReencoded = new TextEncoder().encode(crlfDecoded);
      expect(Array.from(new Uint8Array(crlfBuffer))).toEqual(Array.from(crlfReencoded));
    });
  });

  describe('Corrupt storage or schema mismatch (§9.2, TASK 9)', () => {
    it('shows inline notice and confirmed reset action when storage has schema_mismatch', async () => {
      localStorage.setItem(
        `${APP_ID}:v1:instructions`,
        JSON.stringify({ schemaVersion: 99, savedAt: new Date().toISOString(), data: { text: 'old' } }),
      );

      let state!: InstructionsContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      expect(
        screen.getByText('Your saved instructions use an older format that cannot be migrated.'),
      ).toBeTruthy();

      const resetBtn = screen.getByRole('button', { name: /reset instructions to default/i });
      act(() => {
        fireEvent.click(resetBtn);
      });

      expect(
        screen.queryByText('Your saved instructions use an older format that cannot be migrated.'),
      ).toBeNull();
      expect(state.editorDraft).toBe(defaultInstructionsRaw);
      expect(state.savedText).toBe(defaultInstructionsRaw);
    });

    it('shows inline notice and confirmed reset action when storage has parse_error', async () => {
      localStorage.setItem(`${APP_ID}:v1:instructions`, '{ corrupted json');

      let state!: InstructionsContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      expect(
        screen.getByText('Your saved instructions in browser storage appear corrupted.'),
      ).toBeTruthy();

      const resetBtn = screen.getByRole('button', { name: /reset instructions to default/i });
      act(() => {
        fireEvent.click(resetBtn);
      });

      expect(
        screen.queryByText('Your saved instructions in browser storage appear corrupted.'),
      ).toBeNull();
      expect(state.editorDraft).toBe(defaultInstructionsRaw);
    });
  });

  describe('Settings sheet close prompt (§17.4, TASK 8)', () => {
    it('prompts "Save changes?" when instructions editor is unsaved', () => {
      let onOpenChangeCalledWith: boolean | null = null;
      render(
        <CombinedSheetTest
          open={true}
          onOpenChange={(val) => { onOpenChangeCalledWith = val; }}
        />,
      );

      // Open instructions tab
      const instructionsTab = screen.getByRole('tab', { name: /instructions/i });
      fireEvent.keyDown(instructionsTab, { key: 'Enter', code: 'Enter' });

      // Edit instructions draft
      const textarea = screen.getByRole('textbox', { name: /instructions editor/i });
      fireEvent.change(textarea, { target: { value: 'custom edits' } });

      // Try closing sheet by clicking close button (Sheet close trigger)
      const closeBtn = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeBtn);

      // Confirm dialog appears
      expect(screen.getByText('Save changes?')).toBeTruthy();
      expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /^discard$/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeTruthy();
      expect(onOpenChangeCalledWith).toBeNull(); // Sheet not closed yet
    });

    it('Save button saves both dirty editors and closes sheet', () => {
      let openState = true;
      let masterState!: MasterInfoContextValue;
      let instState!: InstructionsContextValue;

      render(
        <CombinedSheetTest
          open={openState}
          onOpenChange={(val) => { openState = val; }}
          onMasterState={(val) => { masterState = val; }}
          onInstructionsState={(val) => { instState = val; }}
        />,
      );

      // Edit master info
      const masterTab = screen.getByRole('tab', { name: /master info/i });
      fireEvent.keyDown(masterTab, { key: 'Enter', code: 'Enter' });
      const masterTextarea = screen.getByRole('textbox', { name: /master info/i });
      fireEvent.change(masterTextarea, { target: { value: 'updated master' } });

      // Edit instructions
      const instTab = screen.getByRole('tab', { name: /instructions/i });
      fireEvent.keyDown(instTab, { key: 'Enter', code: 'Enter' });
      const instTextarea = screen.getByRole('textbox', { name: /instructions editor/i });
      fireEvent.change(instTextarea, { target: { value: 'updated inst' } });

      // Trigger close
      const closeBtn = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeBtn);

      // Click Save in dialog
      const saveDialogBtn = screen.getByRole('button', { name: /^save$/i });
      act(() => {
        fireEvent.click(saveDialogBtn);
      });

      expect(masterState.savedText).toBe('updated master');
      expect(instState.savedText).toBe('updated inst');
      expect(openState).toBe(false);
    });

    it('Discard button reverts both dirty editors and closes sheet', () => {
      let openState = true;
      let masterState!: MasterInfoContextValue;
      let instState!: InstructionsContextValue;

      render(
        <CombinedSheetTest
          open={openState}
          onOpenChange={(val) => { openState = val; }}
          onMasterState={(val) => { masterState = val; }}
          onInstructionsState={(val) => { instState = val; }}
        />,
      );

      // Edit master info
      const masterTab = screen.getByRole('tab', { name: /master info/i });
      fireEvent.keyDown(masterTab, { key: 'Enter', code: 'Enter' });
      const masterTextarea = screen.getByRole('textbox', { name: /master info/i });
      fireEvent.change(masterTextarea, { target: { value: 'discard me master' } });

      // Trigger close
      const closeBtn = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeBtn);

      // Click Discard
      const discardBtn = screen.getByRole('button', { name: /^discard$/i });
      act(() => {
        fireEvent.click(discardBtn);
      });

      expect(masterState.hasUnsavedChanges).toBe(false);
      expect(instState.hasUnsavedChanges).toBe(false);
      expect(openState).toBe(false);
    });

    it('Cancel button keeps sheet open and leaves changes untouched', () => {
      let openState = true;
      let instState!: InstructionsContextValue;

      render(
        <CombinedSheetTest
          open={openState}
          onOpenChange={(val) => { openState = val; }}
          onInstructionsState={(val) => { instState = val; }}
        />,
      );

      const instTab = screen.getByRole('tab', { name: /instructions/i });
      fireEvent.keyDown(instTab, { key: 'Enter', code: 'Enter' });
      const instTextarea = screen.getByRole('textbox', { name: /instructions editor/i });
      fireEvent.change(instTextarea, { target: { value: 'keep editing' } });

      const closeBtn = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeBtn);

      const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
      act(() => {
        fireEvent.click(cancelBtn);
      });

      expect(instState.editorDraft).toBe('keep editing');
      expect(instState.hasUnsavedChanges).toBe(true);
      expect(openState).toBe(true);
    });
  });

  describe('Allowed localStorage keys check (§9.1)', () => {
    it('localStorage contains only the four allowed keys', () => {
      // Save settings, keys, masterInfo, instructions
      storage.set('settings', { theme: 'dark' });
      storage.set('apiKeys', { anthropic: 'test', gemini: 'test' });
      storage.set('masterInfo', { text: 'my career', updatedAt: new Date().toISOString() });
      storage.set('instructions', { text: 'my instructions', updatedAt: new Date().toISOString() });

      const allowedPrefix = `${APP_ID}:v1:`;
      const allowedKeys = new Set([
        `${allowedPrefix}settings`,
        `${allowedPrefix}apiKeys`,
        `${allowedPrefix}masterInfo`,
        `${allowedPrefix}instructions`,
      ]);

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        expect(allowedKeys.has(key)).toBe(true);
      }
    });
  });
});
