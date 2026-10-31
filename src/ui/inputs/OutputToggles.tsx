import React from 'react';
import { FileText, FileSignature, MessageSquare, Mail, HelpCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { useJob } from '../../state/JobContext';
import type { OutputKind } from '../../types';

interface OutputMeta {
  kind: OutputKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const OUTPUT_OPTIONS: OutputMeta[] = [
  { kind: 'RESUME', label: 'Resume', icon: FileText },
  { kind: 'COVER_LETTER', label: 'Cover Letter', icon: FileSignature },
  { kind: 'LINKEDIN_MESSAGE', label: 'LinkedIn Message', icon: MessageSquare },
  { kind: 'EMAIL', label: 'Email', icon: Mail },
  { kind: 'ANSWERS', label: 'Application Answers', icon: HelpCircle },
];

export function OutputToggles() {
  const { jobInputs, toggleOutput } = useJob();

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-foreground">
        Outputs
      </Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Target outputs">
        {OUTPUT_OPTIONS.map(({ kind, label, icon: Icon }) => {
          const isSelected = jobInputs.selectedOutputs.includes(kind);
          return (
            <Button
              key={kind}
              type="button"
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              aria-pressed={isSelected}
              onClick={() => toggleOutput(kind)}
              className="flex items-center gap-1.5 transition-colors"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
