import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../src/App';
import { AboutPanel } from '../../src/ui/settings/AboutPanel';
import { SettingsSheet } from '../../src/ui/settings/SettingsSheet';
import { SettingsProvider } from '../../src/state/SettingsContext';
import { MasterInfoProvider } from '../../src/state/MasterInfoContext';
import { InstructionsProvider } from '../../src/state/InstructionsContext';
import { APP_NAME, APP_VERSION, PRIVACY_SUMMARY } from '../../src/config';
import pkg from '../../package.json';

describe('About tab and AboutPanel (SPEC §17.4 item 6)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders app name, version from package.json, and shared privacy summary', () => {
    expect(APP_VERSION).toBe(pkg.version);

    render(<AboutPanel />);

    // App name & version
    expect(screen.getByRole('heading', { level: 3, name: new RegExp(`${APP_NAME} v${pkg.version}`) })).toBeTruthy();

    // Privacy summary matches the shared source constant exactly
    expect(screen.getByText(PRIVACY_SUMMARY)).toBeTruthy();

    // External links have rel="noopener noreferrer" and target="_blank"
    const licenseLink = screen.getByRole('link', { name: 'MIT License' });
    expect(licenseLink.getAttribute('href')).toBe('https://github.com/revanth7667/RefractBio/blob/main/LICENSE');
    expect(licenseLink.getAttribute('target')).toBe('_blank');
    expect(licenseLink.getAttribute('rel')).toBe('noopener noreferrer');

    const sourceLink = screen.getByRole('link', { name: /source code/i });
    expect(sourceLink.getAttribute('href')).toBe('https://github.com/revanth7667/RefractBio');
    expect(sourceLink.getAttribute('target')).toBe('_blank');
    expect(sourceLink.getAttribute('rel')).toBe('noopener noreferrer');

    // Support link is not shown when supportUrl is null
    expect(screen.queryByRole('link', { name: /support this project/i })).toBeNull();

    // In-app help link
    const helpLink = screen.getByRole('link', { name: 'Learn more in Help & FAQ' });
    expect(helpLink.getAttribute('href')).toBe('#/help');

    // Decorative logo-full icon has alt="" and aria-hidden="true" (§17.1)
    const logoImg = screen.getByRole('presentation', { hidden: true });
    expect(logoImg).toBeTruthy();
  });

  it('renders support link only when supportUrl is a non-empty string', () => {
    const customLinks = {
      license: 'https://example.com/license',
      source: 'https://example.com/source',
      supportUrl: 'https://example.com/support-me',
      privacy: '#/help',
    };

    render(<AboutPanel links={customLinks} />);

    const supportLink = screen.getByRole('link', { name: 'Support this project' });
    expect(supportLink).toBeTruthy();
    expect(supportLink.getAttribute('href')).toBe('https://example.com/support-me');
    expect(supportLink.getAttribute('target')).toBe('_blank');
    expect(supportLink.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('is present in SettingsSheet and reachable by keyboard / click', async () => {
    render(<App />);

    // Open settings sheet
    const settingsBtn = screen.getByRole('button', { name: 'Settings' });
    fireEvent.click(settingsBtn);

    // About tab trigger exists in tablist
    const aboutTab = screen.getByRole('tab', { name: 'About' });
    expect(aboutTab).toBeTruthy();

    // Select About tab via keyboard
    fireEvent.keyDown(aboutTab, { key: 'Enter', code: 'Enter' });

    // About content is rendered
    expect(await screen.findByRole('heading', { name: new RegExp(`${APP_NAME} v${pkg.version}`) })).toBeTruthy();
    expect(screen.getByText(PRIVACY_SUMMARY)).toBeTruthy();
  });

  it('preserves other tabs and the unsaved-changes close prompt', async () => {
    let onOpenChangeCalledWith: boolean | null = null;

    render(
      <SettingsProvider>
        <MasterInfoProvider>
          <InstructionsProvider>
            <SettingsSheet
              open={true}
              onOpenChange={(val) => {
                onOpenChangeCalledWith = val;
              }}
            />
          </InstructionsProvider>
        </MasterInfoProvider>
      </SettingsProvider>
    );

    // Open instructions tab
    const instructionsTab = screen.getByRole('tab', { name: /instructions/i });
    fireEvent.keyDown(instructionsTab, { key: 'Enter', code: 'Enter' });

    // Edit instructions draft
    const textarea = await screen.findByRole('textbox', { name: /instructions editor/i });
    fireEvent.change(textarea, { target: { value: 'custom edits' } });

    // Switch to About tab
    const aboutTab = screen.getByRole('tab', { name: 'About' });
    fireEvent.keyDown(aboutTab, { key: 'Enter', code: 'Enter' });
    expect(await screen.findByRole('heading', { name: new RegExp(`${APP_NAME} v${pkg.version}`) })).toBeTruthy();

    // Try closing sheet by clicking close button
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);

    // Prompt appears and prevents sheet from closing
    expect(await screen.findByText('Save changes?')).toBeTruthy();
    expect(screen.getByText('You have unsaved changes in your instructions.')).toBeTruthy();
    expect(onOpenChangeCalledWith).toBeNull();
  });
});
