import links from '../../data/links.json';

export function Footer() {
  return (
    <footer className="border-t bg-background py-4 text-center text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4">
        <a
          href={links.license}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          MIT License
        </a>
        <span aria-hidden="true">·</span>
        <a
          href={links.source}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          Source
        </a>
        <span aria-hidden="true">·</span>
        <a
          href={links.support}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          Support this project
        </a>
        <span aria-hidden="true">·</span>
        <a
          href={links.privacy}
          className="hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          Privacy
        </a>
      </div>
    </footer>
  );
}
