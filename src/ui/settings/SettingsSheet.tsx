import { useState, useEffect } from 'react';
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
import { useSettings } from '../../state/SettingsContext';
import { useMasterInfo } from '../../state/MasterInfoContext';
import * as storage from '../../storage/storage';
import { APP_NAME } from '../../config';
import type { Theme, PaperSize } from '../../types';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const { settings, setTheme, setPaperSize, resetAllData } = useSettings();
  const {
    hasUnsavedChanges,
    saveMasterInfo,
    discardDraft,
    clearMasterInfo,
    editorDraft,
  } = useMasterInfo();

  const [approxBytes, setApproxBytes] = useState(0);
  const [showUnsavedCloseConfirm, setShowUnsavedCloseConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setApproxBytes(storage.usage().approxBytes);
    }
  }, [open]);

  const kbUsed = Math.round(approxBytes / 1024);

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && hasUnsavedChanges) {
      setShowUnsavedCloseConfirm(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleSaveAndClose = () => {
    saveMasterInfo();
    setShowUnsavedCloseConfirm(false);
    onOpenChange(false);
  };

  const handleDiscardAndClose = () => {
    discardDraft();
    setShowUnsavedCloseConfirm(false);
    onOpenChange(false);
  };

  const handleCancelClose = () => {
    setShowUnsavedCloseConfirm(false);
  };

  const handleDeleteAll = () => {
    resetAllData();
    clearMasterInfo();
    onOpenChange(false);
    try {
      if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
        window.location.reload();
      }
    } catch {
      // In test environments such as jsdom, location.reload may throw
    }
  };

  const downloadMasterInfoCopy = () => {
    const blob = new Blob([editorDraft], { type: 'text/markdown;charset=utf-8' });
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
            <Tabs defaultValue="providers" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="providers">Providers</TabsTrigger>
                <TabsTrigger value="masterInfo" className="relative">
                  Master Info
                  {hasUnsavedChanges && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="appearance">Appearance</TabsTrigger>
                <TabsTrigger value="data">Data</TabsTrigger>
              </TabsList>

              <TabsContent value="providers" className="mt-6">
                <ProvidersPanel />
              </TabsContent>

              <TabsContent value="masterInfo" className="mt-6">
                <MasterInfoPanel />
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
                  <div className="flex gap-2">
                    {(['letter', 'a4'] as PaperSize[]).map((p) => (
                      <Button
                        key={p}
                        type="button"
                        variant={settings.paperSize === p ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPaperSize(p)}
                        className="uppercase"
                      >
                        {p === 'letter' ? 'US Letter' : 'A4'}
                      </Button>
                    ))}
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
              You have unsaved changes in your Master Info.
            </AlertDialogDescription>
          </AlertDialogHeader>
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
