import React from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { SettingsSheet } from '../settings/SettingsSheet';
import { useSettings } from '../../state/SettingsContext';
import { useGeneration } from '../../state/GenerationContext';
import { APP_NAME } from '../../config';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { storageAvailable, settingsOpen, setSettingsOpen, openSettings } = useSettings();
  const { statusMessage } = useGeneration();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* App-wide aria-live region for announcements (§17.7) */}
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusMessage}
      </div>
      {!storageAvailable && (
        <div
          className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <div className="mx-auto max-w-7xl">
            This browser isn't letting {APP_NAME} save anything (this can happen when the page is opened directly from disk in some browsers, or when site data is blocked). You can still use the app, but your Master Info and settings will be lost when you close the tab. Download your Master Info before leaving.
          </div>
        </div>
      )}
      <Header onOpenSettings={() => openSettings('providers')} />
      <main className="flex-1">{children}</main>
      <Footer />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

