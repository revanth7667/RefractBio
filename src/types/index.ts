// ---------- Providers & models ----------
export type ProviderId = 'anthropic' | 'gemini';

export interface ProviderConfig {
  id: ProviderId;
  apiKey: string;                 // '' when not set. Never logged.
}

export type CapabilityGuess = 'yes' | 'no' | 'unknown';

export interface ModelInfo {
  id: string;                     // exact ID sent to the API
  displayName: string;            // falls back to id
  provider: ProviderId;
  /** false when filtered out as "obviously non-chat"; still listed under "Show all". */
  likelyChat: boolean;
  supportsImages: CapabilityGuess;
  supportsPdf: CapabilityGuess;
  /** Where the capability guesses came from, for the UI hint text. */
  capabilitySource: 'api-metadata' | 'pattern-guess' | 'none';
  /** Soft hint, from data/model-hints.json patterns. Always presented as a guess. */
  smallTierGuess: boolean;
}

// ---------- Settings (persisted, small) ----------
export type Theme = 'system' | 'light' | 'dark';
export type PaperSize = 'letter' | 'a4';

export interface Settings {
  selectedProvider: ProviderId;
  /** Last chosen model per provider. */
  selectedModel: Partial<Record<ProviderId, string>>;
  rememberKeys: boolean;          // default false
  theme: Theme;                   // default 'system'
  paperSize: PaperSize;           // default 'letter'
  /** Per provider; a missing entry means false. Each provider's "Show all models" is independent (§13.4). */
  showAllModels: Partial<Record<ProviderId, boolean>>;
}

// ---------- Master Info (free-form text) ----------
export interface MasterInfoFile {
  text: string;                   // raw text, exactly as the user saved it
  updatedAt: string;              // ISO timestamp
}

/** Result of resolving what counts as "the current Master Info" (A27). */
export interface EffectiveMasterInfo {
  text: string;                   // stored text, or the bundled sample if nothing is stored
  source: 'stored' | 'bundled-sample';
}

// ---------- Instructions file ----------
export type OutputKind = 'RESUME' | 'COVER_LETTER' | 'LINKEDIN_MESSAGE' | 'EMAIL' | 'ANSWERS';

export const OUTPUT_NAMES: Record<OutputKind, string> = {
  RESUME: 'Resume',
  COVER_LETTER: 'Cover Letter',
  LINKEDIN_MESSAGE: 'LinkedIn',
  EMAIL: 'Email',
  ANSWERS: 'Answers',
};
export type InstructionSectionName = 'GLOBAL' | OutputKind;

export interface InstructionsFile {
  text: string;
  updatedAt: string;
}

export interface ResolvedInstructions {
  sections: Record<InstructionSectionName, string>;  // comments stripped
  /** Sections that fell back to bundled defaults. */
  fallbacks: InstructionSectionName[];
  warnings: string[];             // e.g. 'Heading "# COVERLETTER" not recognised…'
}

// ---------- Job inputs (in memory only) ----------
export type AttachmentKind = 'image' | 'pdf' | 'docx' | 'text';

export interface Attachment {
  id: string;                     // crypto.randomUUID()
  name: string;
  mime: string;
  kind: AttachmentKind;
  sizeBytes: number;
  /** image/pdf: base64 without data: prefix. */
  base64?: string;
  /** docx/text: extracted or raw text. */
  text?: string;
  /** Hash used for the stale snapshot (name + size + lastModified + first 64 KB hash). */
  fingerprint: string;
  status: 'ready' | 'reading' | 'error';
  error?: string;
  /** Object URL for image thumbnail preview (§15.4), revoked on removal or clear. */
  objectUrl?: string;
}

export interface JobInputs {
  pastedText: string;
  attachments: Attachment[];
  customInstructions: string;
  questions: string;              // only used by the ANSWERS output (A31)
  selectedOutputs: OutputKind[];  // toggles = "send these"
}

// ---------- Prompt ----------
export type PromptPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; base64: string; name: string }
  | { type: 'pdf'; base64: string; name: string };

export interface AssembledPrompt {
  outputKind: OutputKind;
  system: string;                 // fixed rules
  userParts: PromptPart[];        // ordered: Part A text, attachments, Part C text
  estimate: TokenEstimate;
}

export interface TokenEstimate {
  textTokens: number;             // chars / 4, rounded up
  imageTokens: number;            // images × estimates.imageTokens
  pdfTokens: number;              // per PDF: max(pdfMinTokens, ceil(MB × pdfTokensPerMB)) — size-based guess
  total: number;                  // textTokens + imageTokens + pdfTokens
}

export interface InputSnapshot {
  hash: string;                   // FNV-1a over the canonical inputs (§14.4)
  provider: ProviderId;
  model: string;
  generatedAt: string;            // ISO timestamp
  attachmentNames: string[];
}

// ---------- Output tabs (in memory only) ----------
export type TabStatus = 'idle' | 'generating' | 'done' | 'error';

export interface OutputVersion {
  document: string;               // editable text (excludes gaps)
  gaps: string;                   // text after the delimiter, '' if none returned
  gapsMissing: boolean;           // true if model omitted the delimiter
  truncated: boolean;             // true if the provider stopped at a length limit (A21)
  stopped: boolean;               // true if the user pressed Stop and this is the partial text received (§14.8)
  snapshot: InputSnapshot;
}

export interface OutputTab {
  kind: OutputKind;
  status: TabStatus;
  current: OutputVersion | null;
  previous: OutputVersion | null;
  /** Editor text; equals current.document unless the user edited it. */
  editorText: string;
  userEdited: boolean;
  streamingText: string;          // live text while status === 'generating'
  error: AppError | null;
}

/** Result of splitting a LinkedIn draft into its two variants (A29). */
export interface LinkedInVariants {
  found: boolean;                 // false if either label line is missing
  connectionNote: string;         // text after label 1, label line excluded, trimmed
  directMessage: string;          // text after label 2, label line excluded, trimmed
}

// ---------- Provider adapter ----------
export type ErrorCategory =
  | 'cors_or_network' | 'csp_blocked' | 'auth' | 'rate_limit' | 'bad_request'
  | 'too_large' | 'model_not_found' | 'unsupported_input' | 'safety_blocked'
  | 'server' | 'aborted' | 'stopped' | 'unknown';

export interface AppError {
  category: ErrorCategory;
  message: string;                // plain English (§13.5)
  httpStatus?: number;
  retryAfterSeconds?: number;
  detail?: string;                // provider message, redacted, truncated to 500 chars
}

export interface ConnectionTestResult {
  ok: boolean;
  modelsFound?: number;
  error?: AppError;
  /** Setup hints shown on failure (network, extensions, firewall). */
  suggestions: string[];
}

export interface GenerateRequest {
  config: ProviderConfig;
  model: string;
  prompt: AssembledPrompt;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

export interface GenerateResult {
  text: string;                   // full concatenated text
  finishReason?: string;          // raw provider value, for debugging
  truncated: boolean;             // normalized: stopped because of a length limit (A21, V14)
}

export interface ProviderAdapter {
  id: ProviderId;
  displayName: string;
  listModels(config: ProviderConfig, signal?: AbortSignal): Promise<ModelInfo[]>;
  testConnection(config: ProviderConfig): Promise<ConnectionTestResult>;
  generate(req: GenerateRequest): Promise<GenerateResult>;   // throws AppError
}

