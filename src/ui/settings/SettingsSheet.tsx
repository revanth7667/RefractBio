import { useState, useEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { ProvidersPanel } from './ProvidersPanel';
import { MasterInfoPanel } from './MasterInfoPanel';
import { InstructionsPanel } from './InstructionsPanel';
import { AboutPanel } from './AboutPanel';
import { reloadPage } from './reload';
import { useSettings } from '../../state/SettingsContext';
import { useMasterInfo } from '../../state/MasterInfoContext';
import { useInstructions } from '../../state/InstructionsContext';
import * as storage from '../../storage/storage';
import { APP_NAME } from '../../config';
import type { Theme, PaperSize } from '../../types';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab?: string;
  onTabChange?: (tab: string) => void;
}

export function SettingsSheet({ open, onOpenChange, tab, onTabChange }: SettingsSheetProps) {
  const { settings, setTheme, setPaperSize, resetAllData, settingsTab, setSettingsTab } = useSettings();
  const currentTab = tab ?? settingsTab;
  const handleTabChange = onTabChange ?? setSettingsTab;
  const {
    hasUnsavedChanges: hasUnsavedMasterInfo,
    saveMasterInfo,
    discardDraft: discardMasterInfoDraft,
    clearMasterInfo,
    editorDraft: masterInfoEditorDraft,
  } = useMasterInfo();
  const {
    hasUnsavedChanges: hasUnsavedInstructions,
    saveInstructions,
    discardDraft: discardInstructionsDraft,
    clearInstructions,
    editorDraft: instructionsEditorDraft,
  } = useInstructions();

  const [approxBytes, setApproxBytes] = useState(0);
  const [showUnsavedCloseConfirm, setShowUnsavedCloseConfirm] = useState(false);
  const [saveAllError, setSaveAllError] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const activeTrigger = tabListRef.current?.querySelector<HTMLElement>('[data-state="active"]');
    if (activeTrigger && typeof activeTrigger.scrollIntoView === 'function') {
      activeTrigger.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [currentTab, open]);

  const hasAnyUnsavedChanges = hasUnsavedMasterInfo || hasUnsavedInstructions;

  useEffect(() => {
    if (open) {
      setApproxBytes(storage.usage().approxBytes);
    }
  }, [open]);

  const kbUsed = Math.round(approxBytes / 1024);

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && hasAnyUnsavedChanges) {
      setSaveAllError(null);
      setShowUnsavedCloseConfirm(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleSaveAndClose = () => {
    setSaveAllError(null);
    let masterOk = true;
    let instOk = true;
    let errorMsg = '';

    if (hasUnsavedMasterInfo) {
      const res = saveMasterInfo();
      if (!res.ok) {
        masterOk = false;
        errorMsg = res.message || 'Failed to save Master Info.';
      }
    }

    if (hasUnsavedInstructions) {
      const res = saveInstructions();
      if (!res.ok) {
        instOk = false;
        errorMsg = (errorMsg ? errorMsg + ' ' : '') + (res.message || 'Failed to save Instructions.');
      }
    }

    if (!masterOk || !instOk) {
      setSaveAllError(errorMsg);
      // Keep sheet open and dialog open to show error
      return;
    }

    setShowUnsavedCloseConfirm(false);
    onOpenChange(false);
  };

  const handleDiscardAndClose = () => {
    if (hasUnsavedMasterInfo) {
      discardMasterInfoDraft();
    }
    if (hasUnsavedInstructions) {
      discardInstructionsDraft();
    }
    setShowUnsavedCloseConfirm(false);
    onOpenChange(false);
  };

  const handleCancelClose = () => {
    setShowUnsavedCloseConfirm(false);
  };

  const handleDeleteAll = () => {
    resetAllData();
    clearMasterInfo();
    clearInstructions();
    onOpenChange(false);
    reloadPage();
  };

  const downloadMasterInfoCopy = () => {
    const blob = new Blob([masterInfoEditorDraft], { type: 'text/markdown;charset=utf-8' });
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'master-info.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }
  };

  const downloadInstructionsCopy = () => {
    const blob = new Blob([instructionsEditorDraft], { type: 'text/markdown;charset=utf-8' });
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'instructions.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>
              Manage application appearance and local data.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
              <TabsList
                ref={tabListRef}
                className="flex w-full justify-start overflow-x-auto p-1.5 sm:p-1 sm:grid sm:grid-cols-6 sm:overflow-visible"
              >
                <TabsTrigger value="providers" className="shrink-0">
                  Providers
                </TabsTrigger>
                <TabsTrigger value="masterInfo" className="relative shrink-0">
                  Master Info
                  {hasUnsavedMasterInfo && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="instructions" className="relative shrink-0">
                  Instructions
                  {hasUnsavedInstructions && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="appearance" className="shrink-0">
                  Appearance
                </TabsTrigger>
                <TabsTrigger value="data" className="shrink-0">
                  Data
                </TabsTrigger>
                <TabsTrigger value="about" className="shrink-0">
                  About
                </TabsTrigger>
              </TabsList>

              <TabsContent value="providers" className="mt-6">
                <ProvidersPanel />
              </TabsContent>

              <TabsContent value="masterInfo" className="mt-6">
                <MasterInfoPanel />
              </TabsContent>

              <TabsContent value="instructions" className="mt-6">
                <InstructionsPanel />
              </TabsContent>

              <TabsContent value="appearance" className="mt-6 space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="theme-select" className="text-sm font-medium">
                    Theme
                  </Label>
                  <div className="flex gap-2">
                    {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                      <Button
                        key={t}
                        type="button"
                        variant={settings.theme === t ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTheme(t)}
                        className="capitalize"
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Choose light, dark, or follow your operating system preferences.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="paper-size-select" className="text-sm font-medium">
                    Default Paper Size
                  </Label>
                  <div>
                    <select
                      id="paper-size-select"
                      aria-label="Default Paper Size"
                      value={settings.paperSize}
                      onChange={(e) => setPaperSize(e.target.value as PaperSize)}
                      title="US Letter 21.59 × 27.94 cm (8.5 × 11 in), A4 21.0 × 29.7 cm (8.27 × 11.69 in)"
                      className="h-9 w-full sm:w-auto rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="letter">US Letter 21.59 × 27.94 cm (8.5 × 11 in)</option>
                      <option value="a4">A4 21.0 × 29.7 cm (8.27 × 11.69 in)</option>
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for printable outputs such as resumes and cover letters.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="data" className="mt-6 space-y-6">
                <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                  <h4 className="text-sm font-medium">Storage usage</h4>
                  <p className="text-sm text-muted-foreground">
                    ≈ {kbUsed} KB used by {APP_NAME}. Browsers typically allow about 5 MB per site; the exact limit varies.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-medium text-destructive">Danger Zone</h4>
                  <p className="text-xs text-muted-foreground">
                    Delete all Master Info, custom instructions, saved keys, and preferences from this browser.
                  </p>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        Delete all app data
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete all app data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Delete your Master Info, instructions file, saved API keys and settings from this browser? Download copies first if you want to keep them.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={downloadMasterInfoCopy}
                        >
                          Download Master Info
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={downloadInstructionsCopy}
                        >
                          Download instructions
                        </Button>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAll}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete everything
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TabsContent>

              <TabsContent value="about" className="mt-6">
                <AboutPanel onNavigateToHelp={() => onOpenChange(false)} />
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {/* Unsaved changes on Sheet close prompt (§17.4) */}
      <AlertDialog open={showUnsavedCloseConfirm} onOpenChange={setShowUnsavedCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasUnsavedMasterInfo && !hasUnsavedInstructions
                ? 'You have unsaved changes in your Master Info.'
                : !hasUnsavedMasterInfo && hasUnsavedInstructions
                ? 'You have unsaved changes in your instructions.'
                : 'You have unsaved changes in your Master Info and instructions.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {saveAllError && (
            <p role="alert" className="text-xs text-destructive px-1">
              {saveAllError}
            </p>
          )}
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleDiscardAndClose}
            >
              Discard
            </Button>
            <AlertDialogCancel onClick={handleCancelClose}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndClose}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
