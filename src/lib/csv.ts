// Small CSV serializer + browser download helper. Kept framework-agnostic so
// the leads page and the partner performance report can both lean on it.

type CsvCell = string | number | boolean | null | undefined;

function escapeCsvCell(v: CsvCell): string {
  if (v == null) return '';
  const s = String(v);
  // Quote if it contains a comma, quote, or newline. Escape quotes by doubling.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const bodyLines = rows.map(r => r.map(escapeCsvCell).join(','));
  // Prepend a UTF-8 BOM so Excel opens it with the right encoding on Windows.
  return '\ufeff' + [headerLine, ...bodyLines].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
