export function createId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const entropy = crypto.randomUUID().slice(0, 8);
  return `${prefix}-${timestamp}-${entropy}`;
}

export function slugifyId(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : createId("item");
}
