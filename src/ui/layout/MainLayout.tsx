import React, { useState } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { SettingsSheet } from '../settings/SettingsSheet';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex-1">{children}</main>
      <Footer />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

