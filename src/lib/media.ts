// Admin images (banner art and the like): uploaded to private Blob storage under admin/media/<uuid>, served from
// /api/media/<uuid>. Uploads are never overwritten, so a served image never changes and can be cached for good.
export const MEDIA_PREFIX = "admin/media/";
export const MEDIA_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const mediaUrl = (key: string) => `/api/media/${key}`;
export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];
