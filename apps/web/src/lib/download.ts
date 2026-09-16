"use client";

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => { URL.revokeObjectURL(url); }, 10_000);
}
/** Spreadsheet formula injection is possible even inside quoted CSV cells. */
export function csvCell(value: string): string {
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
