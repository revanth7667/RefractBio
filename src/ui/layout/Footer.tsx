import * as React from 'react';
import defaultLinks from '../../data/links.json';

export interface FooterLinks {
  license: string;
  source: string;
  supportUrl?: string | null;
  privacy: string;
}

export interface FooterProps {
  links?: FooterLinks;
}

export function Footer({ links = defaultLinks }: FooterProps) {
  const linkItems: React.ReactNode[] = [
    <a
      key="license"
      href={links.license}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
    >
      MIT License
    </a>,
    <a
      key="source"
      href={links.source}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
    >
      Source
    </a>,
  ];

  if (typeof links.supportUrl === 'string' && links.supportUrl.trim().length > 0) {
    linkItems.push(
      <a
        key="support"
        href={links.supportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        Support this project
      </a>
    );
  }

  linkItems.push(
    <a
      key="privacy"
      href={links.privacy}
      className="hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
    >
      Privacy
    </a>
  );

  return (
    <footer className="border-t bg-background py-4 text-center text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4">
        {linkItems.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span aria-hidden="true">·</span>}
            {item}
          </React.Fragment>
        ))}
      </div>
    </footer>
  );
}
