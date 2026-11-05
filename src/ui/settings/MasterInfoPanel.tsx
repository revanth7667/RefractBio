import { useState, useRef } from 'react';
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
import { useMasterInfo } from '../../state/MasterInfoContext';
import { hasTemplateMarker, lengthNote } from '../../masterInfo/masterInfo';
import limits from '../../data/limits.json';
import { validateTextUpload } from './uploadValidation';

export function MasterInfoPanel() {
  const {
    editorDraft,
    setEditorDraft,
    effectiveMasterInfo,
    hasUnsavedChanges,
    saveMasterInfo,
    resetMasterInfoToSample,
    loadError,
  } = useMasterInfo();

  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploadText, setPendingUploadText] = useState<string | null>(null);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCorruptResetConfirm, setShowCorruptResetConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const note = lengthNote(editorDraft);
  const effectiveHasMarker = hasTemplateMarker(effectiveMasterInfo.text);

  const handleSave = () => {
    setSaveErrorMessage(null);
    const res = saveMasterInfo();
    if (!res.ok) {
      if (res.reason === 'quota_exceeded') {
        setSaveErrorMessage(
          res.message ||
          "Couldn't save: browser storage is full. Download a copy now, then shorten the file or delete app data.",
        );
      } else {
        setSaveErrorMessage(res.message || 'Failed to save Master Info.');
      }
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }
  };

  const handleDownload = () => {
    downloadFile(editorDraft, 'master-info.md');
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

  return (
    <div className="space-y-4">
      {/* Header and Toolbar slot */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Your Master Info is the single source of truth for all drafted documents.
        </p>
      </div>

      {/* Corrupt data notice (§9.2) */}
      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive space-y-2"
        >
          <p>
            Your saved Master Info could not be loaded because the stored data is invalid or has an
            incompatible version. Generation is blocked until this is resolved.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowCorruptResetConfirm(true)}
          >
            Reset Master Info
          </Button>
        </div>
      )}

      {/* Sample marker notice (§14.6 item 2, SPEC NOTE) */}
      {effectiveHasMarker && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
        >
          Your Master Info still contains the sample marker on its first line. Replace the sample
          with your own information and delete that first line, then try again.
        </div>
      )}

      {/* Editor */}
      <div className="space-y-1.5">
        <Textarea
          value={editorDraft}
          onChange={(e) => {
            setEditorDraft(e.target.value);
            setSaveErrorMessage(null);
          }}
          className="font-mono min-h-[360px] text-xs leading-relaxed resize-y"
          placeholder="Paste or write your Master Info..."
          aria-label="Master Info"
          spellCheck="false"
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{editorDraft.length} characters</span>
          {hasUnsavedChanges && (
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
              Unsaved changes
            </span>
          )}
        </div>

        {/* Length note (§10.4) */}
        {note && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Your Master Info is long (about {note.chars} characters). It is sent with every request,
            which raises cost and can reduce quality. Consider trimming it.
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button onClick={handleSave} size="sm" className="relative">
          {hasUnsavedChanges && (
            <span className="mr-1.5 h-2 w-2 rounded-full bg-amber-300 inline-block" />
          )}
          Save
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          className="hidden"
          onChange={handleFileChange}
        />

        <Button variant="outline" size="sm" onClick={handleDownload}>
          Download
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowResetConfirm(true)}
        >
          Reset to sample
        </Button>
      </div>

      {/* Save Error (quota_exceeded or generic) */}
      {saveErrorMessage && (
        <p className="text-xs text-destructive font-medium">{saveErrorMessage}</p>
      )}

      {/* Upload Error */}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}

      {/* Upload Confirm AlertDialog */}
      <AlertDialog open={showUploadConfirm} onOpenChange={setShowUploadConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace editor content?</AlertDialogTitle>
            <AlertDialogDescription>
              Uploading will replace the current content in your editor with the contents of the
              file. This will not be saved until you press Save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelUpload}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUpload}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset to sample AlertDialog (§10.4) */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to sample?</AlertDialogTitle>
            <AlertDialogDescription>
              Replace your Master Info with the sample? This cannot be undone. Download a copy
              first if you want to keep it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadFile(editorDraft, 'master-info.md')}
            >
              Download copy
            </Button>
            <AlertDialogCancel onClick={() => setShowResetConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetMasterInfoToSample();
                setShowResetConfirm(false);
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Corrupt data reset AlertDialog */}
      <AlertDialog open={showCorruptResetConfirm} onOpenChange={setShowCorruptResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Master Info?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your stored Master Info with the default sample and unblock
              editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCorruptResetConfirm(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetMasterInfoToSample();
                setShowCorruptResetConfirm(false);
              }}
            >
              Reset Master Info
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
