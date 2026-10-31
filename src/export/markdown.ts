import { APP_ID } from '../config';
import type { OutputKind } from '../types';

export function formatDownloadTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}${MM}${dd}-${HH}${mm}`;
}

export function buildMarkdownFilename(kind: OutputKind, date: Date = new Date()): string {
  const kindSlug = kind.toLowerCase().replace(/_/g, '-');
  return `${APP_ID}-${kindSlug}-${formatDownloadTimestamp(date)}.md`;
}

export function downloadMarkdown(kind: OutputKind, text: string, date: Date = new Date()): void {
  const filename = buildMarkdownFilename(kind, date);
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
