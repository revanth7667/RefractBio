import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../../src/ui/layout/Footer';
import shippedLinks from '../../src/data/links.json';

describe('Footer and Links (SPEC §17.1)', () => {
  it('renders shipped links without support anchor: "MIT License · Source · Privacy"', () => {
    const { container } = render(<Footer />);

    // Shipped links.json has supportUrl: null
    expect(shippedLinks.supportUrl).toBeNull();

    // Plain text content has correct separators
    const footerText = container.textContent?.trim();
    expect(footerText).toBe('MIT License·Source·Privacy');

    // Anchors
    const licenseLink = screen.getByRole('link', { name: 'MIT License' });
    expect(licenseLink.getAttribute('href')).toBe('https://github.com/revanth7667/RefractBio/blob/main/LICENSE');
    expect(licenseLink.getAttribute('target')).toBe('_blank');
    expect(licenseLink.getAttribute('rel')).toBe('noopener noreferrer');

    const sourceLink = screen.getByRole('link', { name: 'Source' });
    expect(sourceLink.getAttribute('href')).toBe('https://github.com/revanth7667/RefractBio');
    expect(sourceLink.getAttribute('target')).toBe('_blank');
    expect(sourceLink.getAttribute('rel')).toBe('noopener noreferrer');

    const privacyLink = screen.getByRole('link', { name: 'Privacy' });
    expect(privacyLink.getAttribute('href')).toBe('#/help');
    expect(privacyLink.getAttribute('target')).toBeNull();
    expect(privacyLink.getAttribute('rel')).toBeNull();

    // Support anchor is absent
    expect(screen.queryByRole('link', { name: /support this project/i })).toBeNull();
  });

  it('renders support anchor when supportUrl is a non-empty string', () => {
    const customLinks = {
      license: 'https://example.com/license',
      source: 'https://example.com/source',
      supportUrl: 'https://example.com/donate',
      privacy: '#/help',
    };

    const { container } = render(<Footer links={customLinks} />);

    // Plain text content includes support link with correct separators
    const footerText = container.textContent?.trim();
    expect(footerText).toBe('MIT License·Source·Support this project·Privacy');

    const supportLink = screen.getByRole('link', { name: 'Support this project' });
    expect(supportLink).toBeTruthy();
    expect(supportLink.getAttribute('href')).toBe('https://example.com/donate');
    expect(supportLink.getAttribute('target')).toBe('_blank');
    expect(supportLink.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('omits support anchor when supportUrl is whitespace or empty', () => {
    const customLinks = {
      license: 'https://example.com/license',
      source: 'https://example.com/source',
      supportUrl: '   ',
      privacy: '#/help',
    };

    const { container } = render(<Footer links={customLinks} />);
    expect(screen.queryByRole('link', { name: /support this project/i })).toBeNull();
    expect(container.textContent?.trim()).toBe('MIT License·Source·Privacy');
  });
});
