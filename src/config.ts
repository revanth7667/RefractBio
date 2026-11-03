import pkg from '../package.json';

export const APP_NAME = 'RefractBio';
export const APP_ID = 'refractbio';
export const APP_VERSION = pkg.version;
export const TEMPLATE_MARKER_TOKEN = 'TEMPLATE-UNEDITED';
export const GAPS_DELIMITER_TOKEN = 'GAPS-NOTE';
export const GAPS_DELIMITER = '<!-- GAPS-NOTE -->';
export const MAX_CONCURRENT_GENERATIONS = 2;
export const SCHEMA_VERSION = 1;
export const NUMBER_LOCALE = 'en-US';
export const DOCX_PREVIEW_LIMIT = 2000;
export const LINKEDIN_VARIANT_LABELS = [
  'Variant 1: Connection request note',
  'Variant 2: Direct message',
] as const;

export const PRIVACY_SUMMARY =
  `${APP_NAME} has no server. Your Master Info, instructions and settings stay in this browser. When you press Send or Test connection, your content and API key go directly from your browser to the provider you selected. Nothing is sent to the ${APP_NAME} project. Job context, questions, files and drafts are kept only in memory and disappear when you close or reload the tab.`;

export const GEMINI_FREE_TIER_NOTE =
  "Under Google's [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) (checked 2026-11-02), prompts, inputs, and generated content on the free/unpaid tier may be reviewed by human reviewers and used to improve Google products and AI models. Paid tiers (billing enabled) do not use your data for model training. Because resumes contain sensitive personal details, consider using a Paid Tier key or Anthropic.";
