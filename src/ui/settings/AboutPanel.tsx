import defaultLinks from '../../data/links.json';
import { APP_NAME, APP_VERSION, PRIVACY_SUMMARY } from '../../config';
import logoFullUrl from '../../assets/logo-full.svg';

export interface AboutPanelLinks {
  license: string;
  source: string;
  supportUrl?: string | null;
  privacy: string;
}

export interface AboutPanelProps {
  links?: AboutPanelLinks;
  onNavigateToHelp?: () => void;
}

export function AboutPanel({ links = defaultLinks, onNavigateToHelp }: AboutPanelProps) {
  const hasSupport = typeof links.supportUrl === 'string' && links.supportUrl.trim().length > 0;

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center gap-4">
        <img
          src={logoFullUrl}
          alt=""
          className="h-24 w-24 object-contain shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">
            {APP_NAME} <span className="text-xs font-normal text-muted-foreground">v{APP_VERSION}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Client-side web application for drafting job application materials.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Privacy
        </h4>
        <p className="text-xs text-foreground leading-relaxed">
          {PRIVACY_SUMMARY}
        </p>
        <div>
          <a
            href={links.privacy}
            onClick={onNavigateToHelp}
            className="text-xs font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Learn more in Help & FAQ
          </a>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t text-xs">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Links & License
        </h4>
        <ul className="space-y-1.5 list-none p-0">
          <li>
            <a
              href={links.license}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-foreground"
            >
              MIT License
            </a>
          </li>
          <li>
            <a
              href={links.source}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-foreground"
            >
              Source code (GitHub)
            </a>
          </li>
          {hasSupport && (
            <li>
              <a
                href={links.supportUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-foreground"
              >
                Support this project
              </a>
            </li>
          )}
          <li>
            <a
              href={links.privacy}
              onClick={onNavigateToHelp}
              className="hover:underline text-foreground"
            >
              Help & Privacy documentation
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
