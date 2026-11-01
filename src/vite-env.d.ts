/// <reference types="vite/client" />

declare module 'mammoth' {
  type Mammoth = typeof import('mammoth/lib/index');
  const mammoth: Mammoth;
  export = mammoth;
}

