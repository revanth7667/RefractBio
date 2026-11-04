/**
 * Invokes window.location.reload() through a single exported function so tests can stub it (§17.4).
 */
export function reloadPage(): void {
  if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
    window.location.reload();
  }
}
