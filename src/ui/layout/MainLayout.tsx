import React, { useState } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { SettingsSheet } from '../settings/SettingsSheet';
import { useSettings } from '../../state/SettingsContext';
import { APP_NAME } from '../../config';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { storageAvailable } = useSettings();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {!storageAvailable && (
        <div
          role="alert"
          className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <div className="mx-auto max-w-7xl">
            This browser isn't letting {APP_NAME} save anything (this can happen when the page is opened directly from disk in some browsers, or when site data is blocked). You can still use the app, but your Master Info and settings will be lost when you close the tab. Download your Master Info before leaving.
          </div>
        </div>
      )}
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex-1">{children}</main>
      <Footer />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

