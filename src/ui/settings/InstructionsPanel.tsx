import React, { useState, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { useInstructions } from '../../state/InstructionsContext';
import { SECTION_NAMES, resetSection } from '../../instructions/split';
import type { InstructionSectionName } from '../../types';
import defaultInstructionsRaw from '../../data/instructions.default.md?raw';
import limits from '../../data/limits.json';
import { validateTextUpload } from './uploadValidation';

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function InstructionsPanel() {
  const {
    editorDraft,
    setEditorDraft,
    hasUnsavedChanges,
    saveInstructions,
    resetInstructionsToDefault,
    resolvedDraft,
    loadError,
  } = useInstructions();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedSection, setSelectedSection] = useState<InstructionSectionName>('GLOBAL');
  const [showResetSectionConfirm, setShowResetSectionConfirm] = useState(false);
  const [showResetFileConfirm, setShowResetFileConfirm] = useState(false);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [pendingUploadText, setPendingUploadText] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSuccessMessage, setSavedSuccessMessage] = useState<string | null>(null);

  const handleSave = () => {
    setSaveError(null);
    setSavedSuccessMessage(null);
    const result = saveInstructions();
    if (!result.ok) {
      if (result.reason === 'quota_exceeded') {
        setSaveError(
          "Couldn't save: browser storage is full. Download a copy now, then shorten the file or delete app data.",
        );
      } else {
        setSaveError(result.message || 'Failed to save instructions.');
      }
    } else {
      setSavedSuccessMessage('Instructions saved.');
      setTimeout(() => setSavedSuccessMessage(null), 3000);
    }
  };

  const handleDownload = () => {
    downloadFile(editorDraft, 'instructions.md');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so selecting the same file again triggers change
    e.target.value = '';

    const res = await validateTextUpload(file, limits.masterInfoMaxBytes);
    if (!res.ok) {
      setUploadError(res.error || 'Failed to read the file.');
      return;
    }

    setPendingUploadText(res.text ?? '');
    setShowUploadConfirm(true);
  };

  const confirmUpload = () => {
    if (pendingUploadText !== null) {
      setEditorDraft(pendingUploadText);
    }
    setPendingUploadText(null);
    setShowUploadConfirm(false);
  };

  const cancelUpload = () => {
    setPendingUploadText(null);
    setShowUploadConfirm(false);
  };

  const confirmResetSection = () => {
    const updated = resetSection(editorDraft, selectedSection, defaultInstructionsRaw);
    setEditorDraft(updated);
    setShowResetSectionConfirm(false);
  };

  const confirmResetWholeFile = () => {
    // Both resets change the editor draft only per spec decision
    setEditorDraft(defaultInstructionsRaw);
    setShowResetFileConfirm(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-medium">Instructions</h3>
        <p className="text-sm text-muted-foreground">
          Instructions tell the model how to draft each document. The app splits this file on the six top-level headings (# GLOBAL, # RESUME, etc.).
        </p>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200 space-y-3"
        >
          <p>
            {loadError === 'schema_mismatch'
              ? 'Your saved instructions use an older format that cannot be migrated.'
              : 'Your saved instructions in browser storage appear corrupted.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={resetInstructionsToDefault}
          >
            Reset instructions to default
          </Button>
        </div>
      )}

      {/* Amber notice for warnings computed from editor draft */}
      {resolvedDraft.warnings.length > 0 && (
        <div
          role="alert"
          aria-label="Instructions warnings"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1"
        >
          <div className="font-medium">
            Instructions notice {hasUnsavedChanges ? '(unsaved draft)' : ''}:
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            {resolvedDraft.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Editor Textarea */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <label htmlFor="instructions-editor" className="font-medium text-foreground">
            Editor
          </label>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <span
                data-testid="unsaved-dot"
                className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium"
              >
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            )}
          </div>
        </div>

        <Textarea
          id="instructions-editor"
          value={editorDraft}
          onChange={(e) => setEditorDraft(e.target.value)}
          className="font-mono text-xs leading-relaxed min-h-[320px] resize-y"
          placeholder="Type your instructions here..."
          aria-label="Instructions editor"
        />

        {saveError && (
          <p role="alert" className="text-xs text-destructive">
            {saveError}
          </p>
        )}

        {uploadError && (
          <p role="alert" className="text-xs text-destructive">
            {uploadError}
          </p>
        )}

        {savedSuccessMessage && (
          <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
            {savedSuccessMessage}
          </p>
        )}
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
        <Button onClick={handleSave} size="sm">
          Save
        </Button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".md,.txt,text/markdown,text/plain"
          className="hidden"
          data-testid="instructions-upload-input"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload (.md / .txt)
        </Button>

        <Button variant="outline" size="sm" onClick={handleDownload}>
          Download
        </Button>
      </div>

      {/* Reset Section & Reset Whole File Controls */}
      <div className="pt-4 border-t border-border space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="section-select" className="text-xs font-medium text-foreground">
            Reset section:
          </label>
          <select
            id="section-select"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value as InstructionSectionName)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Select section to reset"
          >
            {SECTION_NAMES.map((name) => (
              <option key={name} value={name}>
                #{name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetSectionConfirm(true)}
          >
            Reset this section
          </Button>
        </div>

        <div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowResetFileConfirm(true)}
          >
            Reset whole file
          </Button>
        </div>
      </div>

      {/* Reset Section AlertDialog */}
      <AlertDialog
        open={showResetSectionConfirm}
        onOpenChange={setShowResetSectionConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset section</AlertDialogTitle>
            <AlertDialogDescription>
              Replace the #{selectedSection} section with the default? Other sections are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetSection}>
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Whole File AlertDialog */}
      <AlertDialog
        open={showResetFileConfirm}
        onOpenChange={setShowResetFileConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset instructions to default</AlertDialogTitle>
            <AlertDialogDescription>
              Replace your instructions file with the default? This cannot be undone. Download a copy first if you want to keep it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:space-x-2">
            <Button variant="outline" onClick={handleDownload}>
              Download copy
            </Button>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetWholeFile}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Confirmation AlertDialog */}
      <AlertDialog open={showUploadConfirm} onOpenChange={setShowUploadConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace instructions with uploaded file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the contents of your instructions editor with the uploaded file. Your changes will not be saved until you press Save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelUpload}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpload}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

