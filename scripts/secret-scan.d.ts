export interface Finding {
  pattern: string;
  preview: string;
  line: number;
  column: number;
}

export interface ScannedFileFinding extends Finding {
  file: string;
}

export interface PatternRule {
  name: string;
  regex: RegExp;
}

export declare const PATTERNS: PatternRule[];
export declare function scanText(text: string): Finding[];
export declare function getTrackedFiles(repoRoot?: string): string[];
export declare function scanRepository(repoRoot?: string): ScannedFileFinding[];
