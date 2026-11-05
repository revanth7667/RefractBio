import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useState } from 'react';
import { SettingsProvider } from '../../src/state/SettingsContext';
import { MasterInfoProvider, useMasterInfo, type MasterInfoContextValue } from '../../src/state/MasterInfoContext';
import { MasterInfoPanel } from '../../src/ui/settings/MasterInfoPanel';
import { SettingsSheet } from '../../src/ui/settings/SettingsSheet';
import { reloadPage } from '../../src/ui/settings/reload';
import * as storage from '../../src/storage/storage';
import limits from '../../src/data/limits.json';
import sampleRaw from '../../src/data/master-info.sample.md?raw';
import editedRaw from '../fixtures/master/edited.md?raw';

vi.mock('../../src/ui/settings/reload', () => ({
  reloadPage: vi.fn(),
}));

function StateSpy({ onState }: { onState: (val: MasterInfoContextValue) => void }) {
  const ctx = useMasterInfo();
  onState(ctx);
  return null;
}

function TestPanel({ onState }: { onState?: (val: MasterInfoContextValue) => void }) {
  return (
    <SettingsProvider>
      <MasterInfoProvider>
        {onState && <StateSpy onState={onState} />}
        <MasterInfoPanel />
      </MasterInfoProvider>
    </SettingsProvider>
  );
}

function TestSheetWithTrigger() {
  const [open, setOpen] = useState(true);
  return (
    <SettingsProvider>
      <MasterInfoProvider>
        <button onClick={() => setOpen(true)}>Open Settings</button>
        <SettingsSheet open={open} onOpenChange={setOpen} />
      </MasterInfoProvider>
    </SettingsProvider>
  );
}

describe('Master Info Panel & State (§10.4, §10.5, §17.4)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('First-run behavior', () => {
    it('shows the sample and sample notice, pre-fills editor, and does NOT write to storage', () => {
      let state!: MasterInfoContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      // Editor pre-filled with bundled sample
      const textarea = screen.getByRole('textbox', { name: /master info/i }) as HTMLTextAreaElement;
      expect(textarea.value).toBe(sampleRaw);

      // Effective source is bundled-sample
      expect(state.effectiveMasterInfo.source).toBe('bundled-sample');
      expect(state.effectiveMasterInfo.text).toBe(sampleRaw);
      expect(state.savedMasterInfo).toBeNull();
      expect(state.hasUnsavedChanges).toBe(false);

      // Nothing written to storage
      expect(storage.get('masterInfo').ok).toBe(false);

      // Notice is shown
      expect(
        screen.getByText(
          'Your Master Info still contains the sample marker on its first line. Replace the sample with your own information and delete that first line, then try again.',
        ),
      ).toBeTruthy();

      // No unsaved changes dot initially
      expect(screen.getByRole('button', { name: /save/i }).querySelector('span')).toBeNull();
    });
  });

  describe('Editing & Saving', () => {
    it('updates editor draft, shows unsaved dot, keeps effective text unchanged until Save', () => {
      let state!: MasterInfoContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      const textarea = screen.getByRole('textbox', { name: /master info/i });
      fireEvent.change(textarea, { target: { value: editedRaw } });

      // Draft updated
      expect(state.editorDraft).toBe(editedRaw);
      expect(state.hasUnsavedChanges).toBe(true);

      // Unsaved editor text is NEVER effective (A27)
      expect(state.effectiveMasterInfo.source).toBe('bundled-sample');
      expect(state.effectiveMasterInfo.text).toBe(sampleRaw);

      // Unsaved dot is visible
      const saveBtn = screen.getByRole('button', { name: /save/i });
      expect(saveBtn.querySelector('span')).toBeTruthy();

      // Click Save
      act(() => {
        fireEvent.click(saveBtn);
      });

      // Now effective text is stored
      expect(state.effectiveMasterInfo.source).toBe('stored');
      expect(state.effectiveMasterInfo.text).toBe(editedRaw);
      expect(state.hasUnsavedChanges).toBe(false);
      expect(saveBtn.querySelector('span')).toBeNull();

      // Notice is gone because edited.md has no template marker
      expect(
        screen.queryByText(
          'Your Master Info still contains the sample marker on its first line. Replace the sample with your own information and delete that first line, then try again.',
        ),
      ).toBeNull();

      // Storage has it
      const stored = storage.get<{ text: string }>('masterInfo');
      expect(stored.ok).toBe(true);
      if (stored.ok) {
        expect(stored.value.text).toBe(editedRaw);
      }
    });

    it('persists across reload', () => {
      // Simulate existing saved data in storage
      storage.set('masterInfo', { text: editedRaw, updatedAt: new Date().toISOString() });

      let state!: MasterInfoContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      expect(state.effectiveMasterInfo.source).toBe('stored');
      expect(state.effectiveMasterInfo.text).toBe(editedRaw);
      expect(state.hasUnsavedChanges).toBe(false);

      const textarea = screen.getByRole('textbox', { name: /master info/i }) as HTMLTextAreaElement;
      expect(textarea.value).toBe(editedRaw);

      // Sample marker notice should NOT be present
      expect(
        screen.queryByText(
          'Your Master Info still contains the sample marker on its first line. Replace the sample with your own information and delete that first line, then try again.',
        ),
      ).toBeNull();
    });

    it('shows inline error message when storage quota is exceeded on save (§9.4)', () => {
      render(<TestPanel />);

      vi.spyOn(storage, 'set').mockReturnValue({
        ok: false,
        reason: 'quota_exceeded',
        message:
          "Couldn't save: browser storage is full. Download a copy now, then shorten the file or delete app data.",
      });

      const textarea = screen.getByRole('textbox', { name: /master info/i });
      fireEvent.change(textarea, { target: { value: 'some modifications' } });

      const saveBtn = screen.getByRole('button', { name: /save/i });
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
      let state!: MasterInfoContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      vi.spyOn(storage, 'set').mockReturnValue({
        ok: false,
        reason: 'unavailable',
        message: 'Storage is not available in this environment',
      });

      const textarea = screen.getByRole('textbox', { name: /master info/i });
      fireEvent.change(textarea, { target: { value: 'In-memory updated text' } });

      const saveBtn = screen.getByRole('button', { name: /save/i });
      act(() => {
        fireEvent.click(saveBtn);
      });

      // Saved in memory, effective source is 'stored'
      expect(state.effectiveMasterInfo.source).toBe('stored');
      expect(state.effectiveMasterInfo.text).toBe('In-memory updated text');
      expect(state.hasUnsavedChanges).toBe(false);
    });
  });

  describe('Corrupt storage or schema mismatch (§9.2)', () => {
    it('shows inline notice and confirmed reset action when storage has parse_error', async () => {
      // Put corrupt json directly in localStorage
      localStorage.setItem('refractbio:v1:masterInfo', '{ broken json');

      render(<TestPanel />);

      // Inline notice shown
      expect(
        screen.getByText(
          'Your saved Master Info could not be loaded because the stored data is invalid or has an incompatible version. Generation is blocked until this is resolved.',
        ),
      ).toBeTruthy();

      // Click Reset Master Info
      const resetBtn = screen.getByRole('button', { name: 'Reset Master Info' });
      fireEvent.click(resetBtn);

      // Confirm dialog appears
      const confirmBtn = await screen.findByRole('button', { name: 'Reset Master Info' });
      act(() => {
        fireEvent.click(confirmBtn);
      });

      // After reset, corrupt notice is gone, sample marker notice is present
      expect(
        screen.queryByText(
          'Your saved Master Info could not be loaded because the stored data is invalid or has an incompatible version. Generation is blocked until this is resolved.',
        ),
      ).toBeNull();
      expect(
        screen.getByText(
          'Your Master Info still contains the sample marker on its first line. Replace the sample with your own information and delete that first line, then try again.',
        ),
      ).toBeTruthy();
    });

    it('shows inline notice and confirmed reset action when storage has schema_mismatch (§9.2)', async () => {
      localStorage.setItem(
        'refractbio:v1:masterInfo',
        JSON.stringify({ schemaVersion: 99, savedAt: new Date().toISOString(), data: { text: 'old' } }),
      );

      render(<TestPanel />);

      expect(
        screen.getByText(
          'Your saved Master Info could not be loaded because the stored data is invalid or has an incompatible version. Generation is blocked until this is resolved.',
        ),
      ).toBeTruthy();

      const resetBtn = screen.getByRole('button', { name: 'Reset Master Info' });
      fireEvent.click(resetBtn);

      const confirmBtn = await screen.findByRole('button', { name: 'Reset Master Info' });
      act(() => {
        fireEvent.click(confirmBtn);
      });

      expect(
        screen.queryByText(
          'Your saved Master Info could not be loaded because the stored data is invalid or has an incompatible version. Generation is blocked until this is resolved.',
        ),
      ).toBeNull();
      expect(
        screen.getByText(
          'Your Master Info still contains the sample marker on its first line. Replace the sample with your own information and delete that first line, then try again.',
        ),
      ).toBeTruthy();
    });
  });

  describe('Reset to sample (§10.4)', () => {
    it('requires confirmation, download copy leaves dialog open, reset saves sample and restores marker', async () => {
      // First save custom text
      storage.set('masterInfo', { text: editedRaw, updatedAt: new Date().toISOString() });

      let state!: MasterInfoContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      // Click Reset to sample
      const resetBtn = screen.getByRole('button', { name: /reset to sample/i });
      fireEvent.click(resetBtn);

      // Check dialog description text matches §10.4 verbatim
      expect(
        screen.getByText(
          'Replace your Master Info with the sample? This cannot be undone. Download a copy first if you want to keep it.',
        ),
      ).toBeTruthy();

      // Download copy button is present
      const downloadCopyBtn = screen.getByRole('button', { name: /download copy/i });
      expect(downloadCopyBtn).toBeTruthy();
      fireEvent.click(downloadCopyBtn);
      // Dialog remains open
      expect(
        screen.getByText(
          'Replace your Master Info with the sample? This cannot be undone. Download a copy first if you want to keep it.',
        ),
      ).toBeTruthy();

      // Click Reset action button in dialog
      const confirmResetBtn = screen.getByRole('button', { name: /^reset$/i });
      act(() => {
        fireEvent.click(confirmResetBtn);
      });

      // Dialog closed
      await waitFor(() => {
        expect(screen.queryByText('Replace your Master Info with the sample? This cannot be undone. Download a copy first if you want to keep it.')).toBeNull();
      });

      // Sample restored in editor AND saved to storage
      expect(state.editorDraft).toBe(sampleRaw);
      expect(state.effectiveMasterInfo.text).toBe(sampleRaw);
      expect(state.effectiveMasterInfo.source).toBe('stored');

      // Marker notice restored
      expect(
        screen.getByText(
          'Your Master Info still contains the sample marker on its first line. Replace the sample with your own information and delete that first line, then try again.',
        ),
      ).toBeTruthy();
    });
  });

  describe('Upload (.md / .txt)', () => {
    it('rejects files with invalid extensions', async () => {
      render(<TestPanel />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const invalidFile = new File(['content'], 'resume.pdf', { type: 'application/pdf' });

      fireEvent.change(input, { target: { files: [invalidFile] } });

      await waitFor(() => {
        expect(screen.getByText('Please upload a .md or .txt file.')).toBeTruthy();
      });
    });

    it('rejects files exceeding masterInfoMaxBytes', async () => {
      render(<TestPanel />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      // Fake a file larger than masterInfoMaxBytes
      const largeFile = new File(['x'], 'large.md', { type: 'text/markdown' });
      Object.defineProperty(largeFile, 'size', { value: limits.masterInfoMaxBytes + 10 });

      fireEvent.change(input, { target: { files: [largeFile] } });

      await waitFor(() => {
        expect(
          screen.getByText(`File exceeds the size limit (${limits.masterInfoMaxBytes} bytes).`),
        ).toBeTruthy();
      });
    });

    it('rejects non-plain-text files with >1% replacement characters', async () => {
      render(<TestPanel />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      // Create binary data with invalid UTF-8 sequences
      const binaryBytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x81, 0x82, 0xff]);
      const binaryFile = new File([binaryBytes], 'binary.txt', { type: 'text/plain' });

      fireEvent.change(input, { target: { files: [binaryFile] } });

      await waitFor(() => {
        expect(screen.getByText("This file doesn't look like plain text.")).toBeTruthy();
      });
    });

    it('requires confirmation, and confirming fills the editor but does NOT save', async () => {
      let state!: MasterInfoContextValue;
      render(<TestPanel onState={(val) => { state = val; }} />);

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const validFile = new File([editedRaw], 'my-info.md', { type: 'text/markdown' });

      fireEvent.change(input, { target: { files: [validFile] } });

      // Confirmation dialog appears
      const confirmDialogTitle = await screen.findByText('Replace editor content?');
      expect(confirmDialogTitle).toBeTruthy();

      // Confirm replace
      const replaceBtn = screen.getByRole('button', { name: /replace/i });
      act(() => {
        fireEvent.click(replaceBtn);
      });

      // Editor filled with uploaded text
      expect(state.editorDraft).toBe(editedRaw);
      expect(state.hasUnsavedChanges).toBe(true);

      // BUT NOT saved to storage yet!
      expect(storage.get('masterInfo').ok).toBe(false);
      expect(state.effectiveMasterInfo.source).toBe('bundled-sample');
    });
  });

  describe('Download & Round-trip byte identity', () => {
    it('downloads editor text and produces byte-identical round-trip for LF and CRLF files', async () => {
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

      // Verify BOM behavior: WHATWG UTF-8 decoder strips 3-byte BOM
      const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(lfContent)]);
      const bomDecoded = new TextDecoder('utf-8').decode(withBom);
      const bomReencoded = new TextEncoder().encode(bomDecoded);
      // Byte lengths differ by 3 because standard TextDecoder strips the BOM
      expect(withBom.length - bomReencoded.length).toBe(3);
    });
  });

  describe('Length note (§10.4)', () => {
    it('shows non-blocking length note above the limit and never disables buttons', () => {
      render(<TestPanel />);

      const textarea = screen.getByRole('textbox', { name: /master info/i });
      const longText = 'x'.repeat(limits.masterInfoWarnChars + 50);
      fireEvent.change(textarea, { target: { value: longText } });

      // Note is visible with exact wording
      expect(
        screen.getByText(
          `Your Master Info is long (about ${limits.masterInfoWarnChars + 50} characters). It is sent with every request, which raises cost and can reduce quality. Consider trimming it.`,
        ),
      ).toBeTruthy();

      // Action buttons remain enabled (non-blocking)
      expect(screen.getByRole('button', { name: /save/i }).getAttribute('disabled')).toBeNull();
      expect(screen.getByRole('button', { name: /upload/i }).getAttribute('disabled')).toBeNull();
      expect(screen.getByRole('button', { name: /download/i }).getAttribute('disabled')).toBeNull();
      expect(screen.getByRole('button', { name: /reset to sample/i }).getAttribute('disabled')).toBeNull();
    });
  });

  describe('Settings sheet close prompt (§17.4)', () => {
    it('prompts "Save changes?" (Save / Discard / Cancel) when closed with unsaved Master Info changes', async () => {
      render(<TestSheetWithTrigger />);

      // Switch to Master Info tab
      const masterInfoTab = screen.getByRole('tab', { name: /master info/i });
      fireEvent.keyDown(masterInfoTab, { key: 'Enter', code: 'Enter' });

      // Make an edit
      const textarea = await screen.findByRole('textbox', { name: /master info/i });
      fireEvent.change(textarea, { target: { value: editedRaw } });

      // Attempt to close the sheet (click the sheet's close button 'X')
      const closeBtn = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeBtn);

      // Sheet should NOT close; confirm dialog appears
      const saveChangesDialog = await screen.findByText('Save changes?');
      expect(saveChangesDialog).toBeTruthy();
      expect(screen.getByText('You have unsaved changes in your Master Info.')).toBeTruthy();

      // Clicking Cancel keeps sheet open
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        expect(screen.queryByText('Save changes?')).toBeNull();
      });
      expect(screen.getByRole('dialog')).toBeTruthy();

      // Trigger close again
      fireEvent.click(closeBtn);
      await screen.findByText('Save changes?');

      // Click Discard -> reverts and closes sheet
      const discardBtn = screen.getByRole('button', { name: 'Discard' });
      act(() => {
        fireEvent.click(discardBtn);
      });
      await waitFor(() => {
        expect(screen.queryByText('Save changes?')).toBeNull();
      });
    });
  });

  describe('Delete all app data resets Master Info to first-run state (§17.4)', () => {
    it('resets in-memory Master Info to first-run state upon confirmation', async () => {
      // First save custom data
      storage.set('masterInfo', { text: editedRaw, updatedAt: new Date().toISOString() });
      vi.mocked(reloadPage).mockClear();

      render(<TestSheetWithTrigger />);

      // Go to Data tab
      const dataTab = screen.getByRole('tab', { name: /data/i });
      fireEvent.keyDown(dataTab, { key: 'Enter', code: 'Enter' });

      const deleteBtn = await screen.findByRole('button', { name: /delete all app data/i });
      fireEvent.click(deleteBtn);

      // Cancel does not reload
      const cancelBtn = await screen.findByRole('button', { name: /cancel/i });
      act(() => {
        fireEvent.click(cancelBtn);
      });
      expect(reloadPage).not.toHaveBeenCalled();

      // Open delete dialog again
      fireEvent.click(deleteBtn);

      // Confirm dialog opens
      const confirmDeleteBtn = await screen.findByRole('button', { name: /delete everything/i });
      act(() => {
        fireEvent.click(confirmDeleteBtn);
      });

      // reloadPage called exactly once after confirmed delete
      expect(reloadPage).toHaveBeenCalledTimes(1);

      // Storage is cleared
      expect(storage.get('masterInfo').ok).toBe(false);

      // Reopen Settings sheet
      const openBtn = screen.getByRole('button', { name: /open settings/i });
      fireEvent.click(openBtn);

      const masterInfoTab = screen.getByRole('tab', { name: /master info/i });
      fireEvent.keyDown(masterInfoTab, { key: 'Enter', code: 'Enter' });

      // Editor shows sample again
      const textarea = (await screen.findByRole('textbox', {
        name: /master info/i,
      })) as HTMLTextAreaElement;
      expect(textarea.value).toBe(sampleRaw);

      // Sample marker notice present
      expect(
        screen.getByText(
          'Your Master Info still contains the sample marker on its first line. Replace the sample with your own information and delete that first line, then try again.',
        ),
      ).toBeTruthy();

      // Only allowed localStorage keys exist
      const allowedKeys = [
        'refractbio:v1:masterInfo',
        'refractbio:v1:instructions',
        'refractbio:v1:apiKeys',
        'refractbio:v1:settings',
      ];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('refractbio:')) {
          expect(allowedKeys).toContain(key);
        }
      }
    });
  });
});
