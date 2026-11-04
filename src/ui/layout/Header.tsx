import { Settings as SettingsIcon, HelpCircle } from 'lucide-react';
import { APP_NAME } from '../../config';
import { Button } from '../components/ui/button';
import logoMarkUrl from '../../assets/logo-mark.svg';

interface HeaderProps {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
  return (
    <header className="border-b bg-background px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center space-x-3">
          <a href="#/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground hover:opacity-90">
            <img src={logoMarkUrl} alt="" className="h-7 w-7 object-contain" aria-hidden="true" />
            <span>{APP_NAME}</span>
          </a>
          <span className="text-xs text-muted-foreground sm:text-sm">Your facts, many drafts.</span>
        </div>
        <div className="flex items-center space-x-2">
          <a
            href="#/help"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Help"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Help</span>
          </a>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="text-muted-foreground hover:text-foreground"
          >
            <SettingsIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
