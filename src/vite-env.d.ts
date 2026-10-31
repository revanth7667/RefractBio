/// <reference types="vite/client" />

declare module 'mammoth' {
  export interface ExtractRawTextResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function extractRawText(options: {
    arrayBuffer?: ArrayBuffer;
    buffer?: Buffer;
    path?: string;
  }): Promise<ExtractRawTextResult>;
  const defaultExport: {
    extractRawText: typeof extractRawText;
  };
  export default defaultExport;
}

