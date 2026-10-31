import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { Attachment, JobInputs, OutputKind } from '../types';
import { classifyFile } from '../files/classify';
import { checkMaxAttachments, checkPerFileMax } from '../files/sizeChecks';
import {
  computeFileFingerprint,
  readAttachmentContent,
} from '../files/read';

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
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  attachmentErrors: string[];
  dismissAttachmentError: (index: number) => void;
  clearAttachmentErrors: () => void;
}

const JobContext = createContext<JobContextValue | undefined>(undefined);

export function JobProvider({ children }: { children: React.ReactNode }) {
  const [jobInputs, setJobInputs] = useState<JobInputs>({
    ...DEFAULT_JOB_INPUTS,
    selectedOutputs: [...DEFAULT_SELECTED_OUTPUTS],
  });
  const [attachmentErrors, setAttachmentErrors] = useState<string[]>([]);

  // Ref to always access current attachments inside async callbacks
  const attachmentsRef = useRef<Attachment[]>(jobInputs.attachments);
  attachmentsRef.current = jobInputs.attachments;

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

  const dismissAttachmentError = useCallback((index: number) => {
    setAttachmentErrors((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachmentErrors = useCallback(() => {
    setAttachmentErrors([]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setJobInputs((prev) => {
      const target = prev.attachments.find((a) => a.id === id);
      if (target?.objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        URL.revokeObjectURL(target.objectUrl);
      }
      return {
        ...prev,
        attachments: prev.attachments.filter((a) => a.id !== id),
      };
    });
  }, []);

  const clearJob = useCallback(() => {
    // Revoke all image object URLs on clear
    for (const att of attachmentsRef.current) {
      if (att.objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        URL.revokeObjectURL(att.objectUrl);
      }
    }

    setAttachmentErrors([]);
    setJobInputs({
      pastedText: '',
      attachments: [],
      customInstructions: '',
      questions: '',
      selectedOutputs: [...DEFAULT_SELECTED_OUTPUTS],
    });
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    // Errors clear on the next add per §15.3
    setAttachmentErrors([]);

    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    const currentCount = attachmentsRef.current.length;
    const { allowedCount, message: capMessage } = checkMaxAttachments(
      currentCount,
      incoming.length,
    );

    const newErrors: string[] = [];
    if (capMessage) {
      newErrors.push(capMessage);
    }

    const filesToProcess = incoming.slice(0, allowedCount);
    const validFilesWithMeta: Array<{
      file: File;
      initial: Attachment;
    }> = [];

    for (const file of filesToProcess) {
      const sizeCheck = checkPerFileMax(file);
      if (!sizeCheck.ok) {
        newErrors.push(sizeCheck.error!);
        continue;
      }

      const classification = classifyFile(file);
      if (!classification.ok) {
        newErrors.push(classification.error);
        continue;
      }

      const id = crypto.randomUUID();
      const objectUrl =
        classification.kind === 'image' && typeof URL !== 'undefined' && URL.createObjectURL
          ? URL.createObjectURL(file)
          : undefined;

      const initial: Attachment = {
        id,
        name: file.name,
        mime: classification.mime,
        kind: classification.kind,
        sizeBytes: file.size,
        fingerprint: '',
        status: 'reading',
        objectUrl,
      };

      validFilesWithMeta.push({ file, initial });
    }

    if (newErrors.length > 0) {
      setAttachmentErrors(newErrors);
    }

    if (validFilesWithMeta.length === 0) {
      return;
    }

    // Add reading attachments immediately
    const initials = validFilesWithMeta.map((v) => v.initial);
    setJobInputs((prev) => ({
      ...prev,
      attachments: [...prev.attachments, ...initials],
    }));

    // Process each file reading asynchronously
    for (const { file, initial } of validFilesWithMeta) {
      (async () => {
        try {
          const fingerprint = await computeFileFingerprint(file);
          const content = await readAttachmentContent(file, initial.kind);
          setJobInputs((prev) => ({
            ...prev,
            attachments: prev.attachments.map((att) =>
              att.id === initial.id
                ? {
                    ...att,
                    status: 'ready',
                    fingerprint,
                    base64: content.base64,
                    text: content.text,
                  }
                : att,
            ),
          }));
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          setJobInputs((prev) => ({
            ...prev,
            attachments: prev.attachments.map((att) =>
              att.id === initial.id
                ? {
                    ...att,
                    status: 'error',
                    error: errMsg,
                    fingerprint: `${file.name}:${file.size}`,
                  }
                : att,
            ),
          }));
        }
      })();
    }
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
        addFiles,
        removeAttachment,
        attachmentErrors,
        dismissAttachmentError,
        clearAttachmentErrors,
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
