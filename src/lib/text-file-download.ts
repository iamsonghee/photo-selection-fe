export function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadTextFile(filename: string, text: string, mime: string) {
  const content = mime.startsWith("text/csv") && !text.startsWith("\uFEFF") ? `\uFEFF${text}` : text;
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
