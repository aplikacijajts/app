export function safeToken(s = "") {
  return String(s)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

export function dateStamp(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function extFromOriginal(originalName = "") {
  const idx = originalName.lastIndexOf(".");
  return idx >= 0 ? originalName.slice(idx).toLowerCase() : "";
}
