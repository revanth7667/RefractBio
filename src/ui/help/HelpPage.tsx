import { ArrowLeft } from 'lucide-react';
import { APP_NAME } from '../../config';
import { Button } from '../components/ui/button';

export function HelpPage() {
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

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{APP_NAME} Help & Documentation</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A private, client-side assistant that drafts resumes, cover letters, and messages exclusively from your Master Info.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-xl font-semibold mb-3">Quick Start</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Open Settings and add your career details in the Master Info panel.</li>
            <li>Add the job posting or context into the left pane.</li>
            <li>Select your desired outputs and press Send.</li>
          </ol>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
            <h3 className="font-semibold text-base mb-2">Privacy & Network</h3>
            <p className="text-sm text-muted-foreground">
              Requests go strictly to the provider you choose (Anthropic or Gemini). No telemetry, analytics, or third-party tracking scripts.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
            <h3 className="font-semibold text-base mb-2">Browser Storage</h3>
            <p className="text-sm text-muted-foreground">
              Master Info and settings are stored locally in your browser. API keys are kept in memory only unless you explicitly toggle &quot;Remember my API keys on this device&quot;.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm space-y-3">
          <h2 className="text-xl font-semibold">Gemini Free-Tier Data-Use Terms (V22)</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Under Google&apos;s <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">Gemini API Additional Terms of Service</a> (checked 2026-10-29), prompts, inputs, and generated content on the free/unpaid tier may be reviewed by human reviewers and used to improve Google products and AI models. Paid tiers (billing enabled) do not use your data for model training. Because resumes contain sensitive personal details, consider using a Paid Tier key or Anthropic.
          </p>
        </div>
      </div>
    </div>
  );
}
