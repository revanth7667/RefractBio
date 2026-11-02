import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import App from '../../src/App';
import * as storage from '../../src/storage/storage';
import { SettingsProvider } from '../../src/state/SettingsContext';
import { MasterInfoProvider } from '../../src/state/MasterInfoContext';
import { InstructionsProvider } from '../../src/state/InstructionsContext';
import { JobProvider } from '../../src/state/JobContext';
import { GenerationProvider, useGeneration } from '../../src/state/GenerationContext';
import { MainLayout } from '../../src/ui/layout/MainLayout';
import { MainWorkspace } from '../../src/ui/layout/MainWorkspace';

function AnnouncementTrigger({ message }: { message: string }) {
  const { announceStatus } = useGeneration();
  return (
    <button type="button" onClick={() => announceStatus(message)}>
      Trigger Announcement
    </button>
  );
}

describe('App-wide Status Region (SPEC §17.7)', () => {
  const cleanMasterInfo = '# Jordan Smith\nSenior Data Analyst';

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();

    storage.set('masterInfo', { text: cleanMasterInfo, updatedAt: new Date().toISOString() });
    storage.set('settings', {
      selectedProvider: 'anthropic',
      selectedModel: { anthropic: 'claude-3-5-sonnet', gemini: 'gemini-1.5-flash' },
      rememberKeys: false,
      paperSize: 'letter',
      theme: 'system',
      showAllModels: false,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('an announcement region is present in the DOM with zero drafts', () => {
    const { container } = render(<App />);

    // Zero drafts generated; empty state is showing
    expect(screen.getByText(/Your drafts will appear here/i)).toBeTruthy();

    // App-wide polite live region exists in the DOM
    const liveRegions = container.querySelectorAll('[aria-live="polite"].sr-only');
    expect(liveRegions).toHaveLength(1);
    expect(liveRegions[0].getAttribute('aria-atomic')).toBe('true');
  });

  it('an announcement is delivered while the Outputs pane is hidden in narrow layout', async () => {
    const { container } = render(
      <SettingsProvider>
        <MasterInfoProvider>
          <InstructionsProvider>
            <JobProvider>
              <GenerationProvider>
                <MainLayout>
                  <MainWorkspace />
                  <AnnouncementTrigger message="Generation finished for Resume" />
                </MainLayout>
              </GenerationProvider>
            </JobProvider>
          </InstructionsProvider>
        </MasterInfoProvider>
      </SettingsProvider>,
    );

    // Outputs pane wrapper is hidden by default in narrow mode (narrowTab === 'inputs')
    const outputsPane = container.querySelector('.md\\:w-\\[60\\%\\]');
    expect(outputsPane?.classList.contains('hidden')).toBe(true);

    // Trigger an announcement
    const triggerBtn = screen.getByRole('button', { name: 'Trigger Announcement' });
    act(() => {
      triggerBtn.click();
    });

    // The app-wide live region is NOT inside the hidden outputs pane
    const liveRegion = container.querySelector('[aria-live="polite"].sr-only');
    expect(liveRegion).toBeTruthy();
    expect(outputsPane?.contains(liveRegion)).toBe(false);
    expect(liveRegion?.textContent).toBe('Generation finished for Resume');
  });

  it('exactly one app-wide status region exists across the application', () => {
    const { container } = render(<App />);

    const appWideRegions = container.querySelectorAll('[aria-live="polite"].sr-only');
    expect(appWideRegions).toHaveLength(1);
  });
});
