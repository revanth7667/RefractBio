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
import { useSettings } from '../../state/SettingsContext';
import * as storage from '../../storage/storage';
import { APP_NAME } from '../../config';
import type { Theme, PaperSize } from '../../types';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsSheet({ open, onOpenChange }: SettingsSheetProps) {
  const { settings, setTheme, setPaperSize, resetAllData } = useSettings();
  const [approxBytes, setApproxBytes] = useState(0);

  useEffect(() => {
    if (open) {
      setApproxBytes(storage.usage().approxBytes);
    }
  }, [open]);

  const kbUsed = Math.round(approxBytes / 1024);

  const handleDeleteAll = () => {
    resetAllData();
    onOpenChange(false);
    try {
      if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
        window.location.reload();
      }
    } catch {
      // In test environments such as jsdom, location.reload may throw
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Manage application appearance and local data.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <Tabs defaultValue="appearance" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
            </TabsList>

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
                        This will permanently delete your Master Info, instructions file, saved API keys, and settings from this browser.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
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
  );
}
