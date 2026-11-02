export function parseWishlist(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? [...new Set(parsed.filter((s): s is string => typeof s === "string" && /^[a-z0-9][a-z0-9_-]{0,100}$/.test(s)))].slice(0, 100) : [];
  } catch { return []; }
}
