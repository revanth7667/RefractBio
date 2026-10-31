import React, { useState } from 'react';
import { ContextArea } from '../inputs/ContextArea';
import { OutputToggles } from '../inputs/OutputToggles';
import { QuestionsBox } from '../inputs/QuestionsBox';
import { CustomInstructions } from '../inputs/CustomInstructions';
import { SendBar } from '../inputs/SendBar';
import { EmptyDraftsState } from '../outputs/EmptyDraftsState';
import { visibleTabs } from '../../generation/visibleTabs';
import { sendBlockers } from '../../prompt/sendBlockers';
import { useSettings } from '../../state/SettingsContext';
import { useMasterInfo } from '../../state/MasterInfoContext';
import { useJob } from '../../state/JobContext';
import type { OutputTab } from '../../types';

// In M7a, tabs are a constant idle set with no versions.
// In M7b, this will be connected to the generation reducer/state machine.
const IDLE_TABS: OutputTab[] = [
  { kind: 'RESUME', status: 'idle', current: null, previous: null, editorText: '', userEdited: false, streamingText: '', error: null },
  { kind: 'COVER_LETTER', status: 'idle', current: null, previous: null, editorText: '', userEdited: false, streamingText: '', error: null },
  { kind: 'LINKEDIN_MESSAGE', status: 'idle', current: null, previous: null, editorText: '', userEdited: false, streamingText: '', error: null },
  { kind: 'EMAIL', status: 'idle', current: null, previous: null, editorText: '', userEdited: false, streamingText: '', error: null },
  { kind: 'ANSWERS', status: 'idle', current: null, previous: null, editorText: '', userEdited: false, streamingText: '', error: null },
];

export function MainWorkspace() {
  const { settings, apiKeys, models } = useSettings();
  const { effectiveMasterInfo, hasUnsavedChanges: hasUnsavedMasterInfo } = useMasterInfo();
  const { jobInputs } = useJob();

  // Active narrow screen tab (Inputs or Outputs)
  const [narrowTab, setNarrowTab] = useState<'inputs' | 'outputs'>('inputs');

  const selectedProvider = settings.selectedProvider;
  const currentKey = apiKeys[selectedProvider];
  const hasApiKey = Boolean(currentKey && currentKey.trim());
  const selectedModel = settings.selectedModel[selectedProvider] || null;
  const currentModels = models[selectedProvider] || [];
  const modelInfo = currentModels.find((m) => m.id === selectedModel) || null;

  const { blocker } = sendBlockers({
    selectedOutputs: jobInputs.selectedOutputs,
    effectiveMasterInfo,
    pastedText: jobInputs.pastedText,
    questions: jobInputs.questions,
    customInstructions: jobInputs.customInstructions,
    attachments: jobInputs.attachments,
    provider: selectedProvider,
    hasApiKey,
    selectedModel,
    modelInfo,
    hasUnsavedMasterInfo,
  });

  const canSend = blocker === null;

  const handleSend = () => {
    if (!canSend) return;
    // M7b seam: Send triggers the generation workflow
    // M7b seam: auto-switch to narrowTab = 'outputs' on mobile
    // setNarrowTab('outputs');
  };

  const handleLeftPaneKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (canSend) {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const displayedTabs = visibleTabs(IDLE_TABS);

  const leftPaneContent = (
    <div
      onKeyDown={handleLeftPaneKeyDown}
      className="space-y-6"
      tabIndex={-1}
    >
      <ContextArea />
      <OutputToggles />
      <QuestionsBox />
      <CustomInstructions />
      <SendBar onSend={handleSend} />
    </div>
  );

  const rightPaneContent = (
    <div className="h-full">
      {displayedTabs.length === 0 ? (
        <EmptyDraftsState />
      ) : (
        <div>{/* M7b seam: OutputTabs rendered here */}</div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Narrow screens (< 768px): tabs for Inputs and Outputs per §17.1 */}
      <div className="md:hidden mb-4">
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-muted-foreground" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={narrowTab === 'inputs'}
            onClick={() => setNarrowTab('inputs')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${
              narrowTab === 'inputs'
                ? 'bg-background text-foreground shadow'
                : 'hover:text-foreground'
            }`}
          >
            Inputs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={narrowTab === 'outputs'}
            onClick={() => setNarrowTab('outputs')}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${
              narrowTab === 'outputs'
                ? 'bg-background text-foreground shadow'
                : 'hover:text-foreground'
            }`}
          >
            Outputs
            {/* M7b seam: generating dot indicator when generating */}
          </button>
        </div>
      </div>

      {/* Main two-pane layout: collapsed to active tab on <768px, 40/60 side-by-side on ≥768px */}
      <div className="flex flex-col md:flex-row md:gap-8 w-full">
        {/* Left pane: Inputs */}
        <div
          className={`${
            narrowTab === 'inputs' ? 'block' : 'hidden'
          } md:block md:w-[40%] md:overflow-y-auto md:max-h-[calc(100vh-10rem)] md:pr-2`}
        >
          {leftPaneContent}
        </div>

        {/* Right pane: Outputs */}
        <div
          className={`${
            narrowTab === 'outputs' ? 'block' : 'hidden'
          } md:block md:w-[60%] md:overflow-y-auto md:max-h-[calc(100vh-10rem)] md:pl-2 md:border-l md:border-border/40`}
        >
          {rightPaneContent}
        </div>
      </div>
    </div>
  );
}
