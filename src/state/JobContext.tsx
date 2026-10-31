import React, { createContext, useContext, useState, useCallback } from 'react';
import type { JobInputs, OutputKind } from '../types';

export const OUTPUT_ORDER: readonly OutputKind[] = [
  'RESUME',
  'COVER_LETTER',
  'LINKEDIN_MESSAGE',
  'EMAIL',
  'ANSWERS',
] as const;

export const DEFAULT_SELECTED_OUTPUTS: OutputKind[] = ['RESUME', 'COVER_LETTER'];

export const DEFAULT_JOB_INPUTS: JobInputs = {
  pastedText: '',
  attachments: [],
  customInstructions: '',
  questions: '',
  selectedOutputs: [...DEFAULT_SELECTED_OUTPUTS],
};

function sortOutputs(kinds: OutputKind[]): OutputKind[] {
  return OUTPUT_ORDER.filter((o) => kinds.includes(o));
}

export interface JobContextValue {
  jobInputs: JobInputs;
  setPastedText: (text: string) => void;
  setCustomInstructions: (instructions: string) => void;
  setQuestions: (questions: string) => void;
  setSelectedOutputs: (outputs: OutputKind[]) => void;
  toggleOutput: (kind: OutputKind) => void;
  clearJob: () => void;
}

const JobContext = createContext<JobContextValue | undefined>(undefined);

export function JobProvider({ children }: { children: React.ReactNode }) {
  const [jobInputs, setJobInputs] = useState<JobInputs>({
    ...DEFAULT_JOB_INPUTS,
    selectedOutputs: [...DEFAULT_SELECTED_OUTPUTS],
  });

  const setPastedText = useCallback((pastedText: string) => {
    setJobInputs((prev) => ({ ...prev, pastedText }));
  }, []);

  const setCustomInstructions = useCallback((customInstructions: string) => {
    setJobInputs((prev) => ({ ...prev, customInstructions }));
  }, []);

  const setQuestions = useCallback((questions: string) => {
    setJobInputs((prev) => ({ ...prev, questions }));
  }, []);

  const setSelectedOutputs = useCallback((outputs: OutputKind[]) => {
    setJobInputs((prev) => ({
      ...prev,
      selectedOutputs: sortOutputs(outputs),
    }));
  }, []);

  const toggleOutput = useCallback((kind: OutputKind) => {
    setJobInputs((prev) => {
      const exists = prev.selectedOutputs.includes(kind);
      const next = exists
        ? prev.selectedOutputs.filter((k) => k !== kind)
        : [...prev.selectedOutputs, kind];
      return {
        ...prev,
        selectedOutputs: sortOutputs(next),
      };
    });
  }, []);

  const clearJob = useCallback(() => {
    setJobInputs({
      pastedText: '',
      attachments: [],
      customInstructions: '',
      questions: '',
      selectedOutputs: [...DEFAULT_SELECTED_OUTPUTS],
    });
  }, []);

  return (
    <JobContext.Provider
      value={{
        jobInputs,
        setPastedText,
        setCustomInstructions,
        setQuestions,
        setSelectedOutputs,
        toggleOutput,
        clearJob,
      }}
    >
      {children}
    </JobContext.Provider>
  );
}

export function useJob(): JobContextValue {
  const context = useContext(JobContext);
  if (!context) {
    throw new Error('useJob must be used within a JobProvider');
  }
  return context;
}
