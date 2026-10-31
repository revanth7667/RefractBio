import { SettingsProvider } from './state/SettingsContext';
import { MasterInfoProvider } from './state/MasterInfoContext';
import { InstructionsProvider } from './state/InstructionsContext';
import { JobProvider } from './state/JobContext';
import { GenerationProvider } from './state/GenerationContext';
import { useHashRoute } from './state/useHashRoute';
import { MainLayout } from './ui/layout/MainLayout';
import { MainWorkspace } from './ui/layout/MainWorkspace';
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
      <MainWorkspace />
    </MainLayout>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <MasterInfoProvider>
        <InstructionsProvider>
          <JobProvider>
            <GenerationProvider>
              <AppContent />
            </GenerationProvider>
          </JobProvider>
        </InstructionsProvider>
      </MasterInfoProvider>
    </SettingsProvider>
  );
}
