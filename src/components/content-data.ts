import { isPublicRecord, safeUrl, type ContentModule } from "@/lib/content";

export function contentUrl(value: unknown) {
  try { return safeUrl(value); } catch { return null; }
}

export function publicModules(modules: ContentModule[], now = new Date()) {
  return modules.filter((module) => isPublicRecord(module, now.getTime()) && (!module.ends_at || Date.parse(module.ends_at) > now.getTime()))
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
}

export function videoUrl(value: unknown) {
  const safe = contentUrl(value);
  if (!safe || !safe.startsWith("https://")) return null;
  const url = new URL(safe);
  if (!url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) ||
      /\.(?:local|localhost|internal|test|invalid)$/.test(url.hostname) ||
      (url.port && url.port !== "443") || !/\.(?:mp4|webm|ogv)$/i.test(url.pathname)) return null;
  return safe;
}
