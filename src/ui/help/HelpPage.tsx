import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import MarkdownIt from 'markdown-it';
import helpContentRaw from '../../../docs/help.md?raw';
import { Button } from '../components/ui/button';
import './help.css';

export function createHelpMarkdownRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
  });

  const defaultRender =
    md.renderer.rules.link_open ||
    function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    return defaultRender(tokens, idx, options, env, self);
  };

  return md;
}

export function HelpPage() {
  const renderedHtml = useMemo(() => {
    const md = createHelpMarkdownRenderer();
    return md.render(helpContentRaw);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <a href="#/">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to drafts
          </Button>
        </a>
      </div>

      <div
        className="help-content rounded-lg border bg-card p-6 sm:p-8 text-card-foreground shadow-sm"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
}
