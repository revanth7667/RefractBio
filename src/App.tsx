import { SettingsProvider } from './state/SettingsContext';
import { useHashRoute } from './state/useHashRoute';
import { MainLayout } from './ui/layout/MainLayout';
import { HelpPage } from './ui/help/HelpPage';

function AppContent() {
  const route = useHashRoute();

  if (route === '/help') {
    return (
      <MainLayout>
        <HelpPage />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Your drafts will appear here
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            1. Fill in your Master Info (Settings).<br />
            2. Add job context.<br />
            3. Pick outputs and press Send.
          </p>
        </div>
      </div>
    </MainLayout>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
}
