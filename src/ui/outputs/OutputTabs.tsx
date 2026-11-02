import { useState, useEffect } from 'react';
import { Loader2, Check, AlertCircle, Copy, Download, RefreshCw, Undo2, Printer } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { useGeneration } from '../../state/GenerationContext';
import { useSettings } from '../../state/SettingsContext';
import { visibleTabs } from '../../generation/visibleTabs';
import { formatGapsNotice } from '../../generation/gaps';
import { splitLinkedInVariants, hasEmailSubject } from '../../generation/variants';
import { splitEmailDraft } from '../../export/email';
import { copyToClipboard } from '../../export/clipboard';
import { downloadMarkdown } from '../../export/markdown';
import { printDocument } from '../../export/print';
import type { OutputKind, OutputTab, PaperSize } from '../../types';

const OUTPUT_TAB_LABELS: Record<OutputKind, string> = {
  RESUME: 'Resume',
  COVER_LETTER: 'Cover Letter',
  LINKEDIN_MESSAGE: 'LinkedIn',
  EMAIL: 'Email',
  ANSWERS: 'Answers',
};

const OUTPUT_DRAFT_LABELS: Record<OutputKind, string> = {
  RESUME: 'Resume',
  COVER_LETTER: 'Cover Letter',
  LINKEDIN_MESSAGE: 'LinkedIn Message',
  EMAIL: 'Email',
  ANSWERS: 'Application Answers',
};

function formatProviderName(provider: string): string {
  if (provider === 'gemini') return 'Google Gemini';
  if (provider === 'anthropic') return 'Anthropic';
  return provider;
}

export function OutputTabs() {
  const {
    tabs,
    activeTab,
    setActiveTab,
    retryTab,
    restoreTab,
    editTab,
    isTabBusy,
    isTabStale,
    announceStatus,
  } = useGeneration();

  const displayedTabs = visibleTabs(tabs);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Keep active tab in sync with visible tabs
  useEffect(() => {
    if (displayedTabs.length > 0) {
      const currentActiveStillVisible = displayedTabs.some((t) => t.kind === activeTab);
      if (!currentActiveStillVisible) {
        setActiveTab(displayedTabs[0].kind);
      }
    }
  }, [displayedTabs, activeTab, setActiveTab]);

  const handleCopy = async (key: string, text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedKey(key);
      announceStatus('Copied to clipboard');
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    } else {
      announceStatus("Couldn't copy. Select the text and press Ctrl+C (Cmd+C on Mac).");
    }
  };

  if (displayedTabs.length === 0) {
    return null;
  }

  const currentTab = tabs[activeTab] || displayedTabs[0];

  return (
    <div className="space-y-4">
      <Tabs
        value={currentTab.kind}
        onValueChange={(val) => setActiveTab(val as OutputKind)}
        className="w-full"
      >
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/60 p-1">
          {displayedTabs.map((tab) => {
            const stale = isTabStale(tab.kind);
            return (
              <TabsTrigger
                key={tab.kind}
                value={tab.kind}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
              >
                <span>{OUTPUT_TAB_LABELS[tab.kind]}</span>
                {stale && (
                  <span
                    data-testid={`stale-dot-${tab.kind}`}
                    className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
                    title="Inputs changed since this was generated"
                    aria-label="Inputs changed"
                  />
                )}
                {tab.status === 'generating' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Generating" />
                )}
                {tab.status === 'done' && (
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Done" />
                )}
                {tab.status === 'error' && (
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Error" />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {displayedTabs.map((tab) => (
          <TabsContent key={tab.kind} value={tab.kind} className="space-y-4 mt-4">
            <TabBody
              tab={tab}
              isBusy={isTabBusy(tab.kind)}
              isStale={isTabStale(tab.kind)}
              copiedKey={copiedKey}
              onCopy={handleCopy}
              onRetry={() => retryTab(tab.kind)}
              onRestore={() => restoreTab(tab.kind)}
              onEdit={(text) => editTab(tab.kind, text)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface TabBodyProps {
  tab: OutputTab;
  isBusy: boolean;
  isStale: boolean;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
  onRetry: () => void;
  onRestore: () => void;
  onEdit: (text: string) => void;
}

function TabBody({
  tab,
  isBusy,
  isStale,
  copiedKey,
  onCopy,
  onRetry,
  onRestore,
  onEdit,
}: TabBodyProps) {
  const { settings, setPaperSize } = useSettings();
  const linkedInVariants =
    tab.kind === 'LINKEDIN_MESSAGE' ? splitLinkedInVariants(tab.editorText) : null;
  const emailParts =
    tab.kind === 'EMAIL' ? splitEmailDraft(tab.editorText) : null;
  const isFinishedAndNonEmpty =
    !isBusy && tab.status !== 'generating' && tab.editorText.trim().length > 0;
  const isEmailMissingSubject =
    tab.kind === 'EMAIL' && isFinishedAndNonEmpty && !hasEmailSubject(tab.editorText);
  const isLinkedInMissingLabels =
    tab.kind === 'LINKEDIN_MESSAGE' && isFinishedAndNonEmpty && !linkedInVariants?.found;

  const snapshot = tab.current?.snapshot;
  const generatedTime = snapshot
    ? new Date(snapshot.generatedAt).toLocaleTimeString()
    : '';

  return (
    <div className="space-y-4">
      {/* Tab Toolbar (§17.3) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {tab.status === 'error' ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={isBusy}
              onClick={onRetry}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={onRetry}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Regenerate
            </Button>
          )}

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={tab.previous === null || isBusy}
              title={tab.previous ? 'Restore previous version' : 'No earlier version yet'}
              onClick={onRestore}
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" />
              Restore previous version
            </Button>
            {tab.previous === null && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                No earlier version yet
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* LinkedIn per-variant copy buttons (§16.2) */}
          {tab.kind === 'LINKEDIN_MESSAGE' && linkedInVariants?.found ? (
            <>
              <span className="text-xs text-muted-foreground mr-1">
                {linkedInVariants.connectionNote.length} characters
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  onCopy('linkedin-note', linkedInVariants.connectionNote)
                }
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {copiedKey === 'linkedin-note' ? 'Copied' : 'Copy connection note'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  onCopy('linkedin-dm', linkedInVariants.directMessage)
                }
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {copiedKey === 'linkedin-dm' ? 'Copied' : 'Copy direct message'}
              </Button>
            </>
          ) : null}

          {/* Email per-part copy buttons (§16.2) */}
          {tab.kind === 'EMAIL' && emailParts?.found ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onCopy('email-subject', emailParts.subject)}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {copiedKey === 'email-subject' ? 'Copied' : 'Copy subject'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onCopy('email-body', emailParts.body)}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {copiedKey === 'email-body' ? 'Copied' : 'Copy body'}
              </Button>
            </>
          ) : null}

          {/* Copy all / Copy button (§16.1, §16.2) */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onCopy(`${tab.kind}-all`, tab.editorText)}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {copiedKey === `${tab.kind}-all`
              ? 'Copied'
              : tab.kind === 'LINKEDIN_MESSAGE' || tab.kind === 'ANSWERS'
              ? 'Copy all'
              : 'Copy'}
          </Button>

          {/* Download .md (§16.1) */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => downloadMarkdown(tab.kind, tab.editorText)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download .md
          </Button>

          {/* Print / Save as PDF (§16.3, §17.3) */}
          {(tab.kind === 'RESUME' || tab.kind === 'COVER_LETTER') && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`paper-size-${tab.kind}`} className="sr-only">
                Paper size
              </label>
              <select
                id={`paper-size-${tab.kind}`}
                aria-label="Paper size"
                value={settings.paperSize}
                onChange={(e) => setPaperSize(e.target.value as PaperSize)}
                title="US Letter 21.59 × 27.94 cm (8.5 × 11 in), A4 21.0 × 29.7 cm (8.27 × 11.69 in)"
                className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy || !tab.editorText.trim()}
                onClick={() => printDocument(tab.editorText, settings.paperSize, tab.kind)}
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print / Save as PDF
              </Button>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                In the print dialog, choose &apos;Save as PDF&apos;, and turn off &apos;Headers and footers&apos; for a clean page.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* LinkedIn missing variants notice (§16.2) */}
      {isLinkedInMissingLabels && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
          Couldn't find the two variant labels, so per-variant copy is off. Check the labels in the draft or in your instructions file.
        </div>
      )}

      {/* Meta line (§17.3) */}
      {tab.current && snapshot && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Generated with {formatProviderName(snapshot.provider)} · {snapshot.model} · {generatedTime}
          </span>
          {tab.userEdited && (
            <Badge variant="outline" className="text-xs">
              Edited
            </Badge>
          )}
          {isStale && (
            <Badge
              variant="outline"
              title={`Generated with ${formatProviderName(snapshot.provider)} · ${snapshot.model} · ${generatedTime}${snapshot.attachmentNames?.length ? ` · ${snapshot.attachmentNames.join(', ')}` : ''}`}
              className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs"
            >
              Inputs changed since this was generated
            </Badge>
          )}
        </div>
      )}

      {/* Truncation notice (A21, §14.3) */}
      {tab.current?.truncated && (
        <div
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/15 p-3 text-xs font-medium text-amber-900 dark:text-amber-200"
        >
          This draft was cut off before the model finished. Press Regenerate, or choose a model or setting that allows longer output.
        </div>
      )}

      {/* Gaps note area (§12.7, §17.3) */}
      {tab.current && (
        <div className="space-y-2">
          <details
            open={Boolean(tab.current.gaps && tab.current.gaps.trim().toLowerCase() !== '- none')}
            className="group rounded-md border border-muted bg-muted/20 p-3 text-xs"
          >
            <summary className="cursor-pointer font-medium text-foreground select-none">
              Gaps: things the job or your questions ask for that aren't in your Master Info
            </summary>
            <div className="mt-2 text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {formatGapsNotice(tab.current.gaps, tab.current.gapsMissing)}
            </div>
          </details>

          {/* Safety-net badges (§12.7) */}
          {isEmailMissingSubject && (
            <div>
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs">
                No Subject line
              </Badge>
            </div>
          )}

          {isLinkedInMissingLabels && (
            <div>
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs">
                LinkedIn variant labels missing. Per-variant copy is off; check the two label lines in the draft.
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Error Callout (§13.5, §17.3) */}
      {tab.status === 'error' && tab.error && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <div className="font-medium">{tab.error.message}</div>
          {tab.error.detail && (
            <details className="mt-1">
              <summary className="cursor-pointer text-muted-foreground hover:underline select-none">
                Show details
              </summary>
              <pre className="mt-1.5 max-h-40 overflow-x-auto rounded bg-background/80 p-2 font-mono text-[11px] text-foreground">
                {tab.error.detail}
              </pre>
            </details>
          )}
          <div className="pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Monospace Textarea Editor (§17.3) */}
      <div className="space-y-1">
        <Textarea
          aria-label={`${OUTPUT_DRAFT_LABELS[tab.kind]} draft`}
          value={tab.status === 'generating' ? (tab.streamingText || 'Generating…') : tab.editorText}
          readOnly={tab.status === 'generating'}
          onChange={(e) => onEdit(e.target.value)}
          className="min-h-[420px] font-mono text-sm leading-relaxed resize-y"
          placeholder="Generated output will appear here…"
        />
      </div>
    </div>
  );
}
