import { sql } from "./db";
import { randomUUID } from "node:crypto";

export type ContentModule = {
  id: string; type: string; title: string; body: string | null;
  image_url: string | null; mobile_image_url: string | null;
  link_url: string | null; link_label: string | null;
  payload: Record<string, unknown>; sort: number;
  status: "draft" | "published" | "archived"; publish_at: string | null;
  ends_at: string | null;
};
export type Collection = {
  slug: string; title: string; description: string | null;
  image_url: string | null; book_slugs: string[];
};
export type AuthorProfile = { id: string; name: string; bio: string | null; photo_url: string | null };
export const contentSections = ["modules", "collections", "media", "testimonials", "authors"] as const;
export type ContentSection = typeof contentSections[number];
export const moduleTypes = ["hero", "banner", "text", "collection", "testimonial", "author", "media", "announcement", "promo", "genre-switcher"] as const;
const themes = ["coral", "sky", "yellow", "green", "ink", "lilac"];
export class ContentError extends Error {}

export function safeUrl(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 2000 || /[\s\\\x00-\x1f]/.test(value)) throw new ContentError("Invalid URL.");
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new ContentError("Invalid URL."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new ContentError("Use a site path or an HTTPS URL.");
  return value;
}
export function isPublicRecord(record: { status: string; publish_at: string | null }, now = Date.now()) {
  return record.status === "published" && (record.publish_at === null || Date.parse(record.publish_at) <= now);
}
export function textField(value: unknown, max: number, required = false): string {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new ContentError("Invalid or missing text field.");
  return value.trim();
}
export function validateContent(section: ContentSection, input: Record<string, unknown>) {
  const title = textField(input.title ?? input.name, 200, true);
  const status = input.status ?? "draft";
  if (!["draft", "published", "archived"].includes(String(status))) throw new ContentError("Invalid publication status.");
  const publishAt = input.publish_at ? textField(input.publish_at, 40) : null;
  if (publishAt && !Number.isFinite(Date.parse(publishAt))) throw new ContentError("Invalid publication date.");
  const endsAt = input.ends_at ? textField(input.ends_at, 40) : null;
  if (endsAt && !Number.isFinite(Date.parse(endsAt))) throw new ContentError("Invalid end date.");
  if (endsAt && publishAt && Date.parse(endsAt) <= Date.parse(publishAt)) throw new ContentError("The end date must be after the publish date.");
  const sort = Number(input.sort ?? 0);
  if (!Number.isSafeInteger(sort) || Math.abs(sort) > 100000) throw new ContentError("Invalid sort order.");
  const type = input.type ?? "text";
  if (section === "modules" && !moduleTypes.includes(type as typeof moduleTypes[number])) throw new ContentError("Invalid module type.");
  const slug = input.slug ? textField(input.slug, 120) : "";
  if (section === "collections" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ContentError("Use a lowercase collection slug.");
  const bookSlugs = input.book_slugs ?? [];
  if (!Array.isArray(bookSlugs) || bookSlugs.length > 100 || bookSlugs.some(s => typeof s !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) || new Set(bookSlugs).size !== bookSlugs.length) throw new ContentError("Invalid book selection.");
  const payload = input.payload ?? {};
  const allowedKeys = ["subtitle", "quote", "attribution", "collection_slug", "author_id", "book_slugs", "video_url", "theme", "size", "category_slug", "category_slugs"];
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || JSON.stringify(payload).length > 10000 || Object.keys(payload).some(k => !allowedKeys.includes(k))) throw new ContentError("Invalid module data.");
  for (const [key, value] of Object.entries(payload)) {
    if (key === "video_url") safeUrl(value);
    else if (key === "theme") { if (!themes.includes(String(value))) throw new ContentError("Invalid theme."); }
    else if (key === "size") { if (!["large", "small"].includes(String(value))) throw new ContentError("Invalid tile size."); }
    else if (key === "category_slug") { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new ContentError("Invalid category."); }
    else if (key === "category_slugs") {
      if (!Array.isArray(value) || value.length > 8 || value.some(s => typeof s !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))) throw new ContentError("Choose up to 8 categories.");
    } else if (key === "book_slugs") {
      if (!Array.isArray(value) || value.length > 100 || value.some(s => typeof s !== "string" || !/^[a-z0-9-]{1,120}$/.test(s))) throw new ContentError("Invalid module book selection.");
    } else textField(value, 4000);
  }
  return { title, status: status as ContentModule["status"], publish_at: publishAt, ends_at: endsAt, sort, type: String(type), slug,
    body: textField(input.body ?? input.bio ?? input.description, 20000) || null,
    image_url: safeUrl(input.image_url ?? input.photo_url), mobile_image_url: safeUrl(input.mobile_image_url),
    link_url: safeUrl(input.link_url), link_label: textField(input.link_label, 100) || null,
    book_slugs: bookSlugs as string[], payload: payload as Record<string, unknown> };
}

export async function getPublicContent(): Promise<{ modules: ContentModule[]; collections: Collection[]; authors: AuthorProfile[] }> {
  const [modules, collections, authors] = await Promise.all([
    sql`select id, type, title, body, image_url, mobile_image_url, link_url, link_label, payload, sort, status, publish_at::text, ends_at::text
      from content_modules where status = 'published' and (publish_at is null or publish_at <= now()) and (ends_at is null or ends_at > now()) order by sort, id`,
    sql`select c.slug, c.title, c.description, c.image_url,
      coalesce((select jsonb_agg(s.slug order by s.ordinality) from jsonb_array_elements_text(c.book_slugs) with ordinality s(slug, ordinality)
        join books b on b.slug = s.slug where b.active and b.release_approved and b.scan_status = 'clean' and b.price_inr > 0 and b.file_url is not null
        and (not b.third_party or (b.rights_approved and b.commercial_approved))), '[]'::jsonb) as book_slugs
      from content_collections c where c.status = 'published' and (c.publish_at is null or c.publish_at <= now()) order by c.sort, c.slug`,
    sql`select id, name, bio, photo_url from author_profiles where status = 'published' and (publish_at is null or publish_at <= now()) order by name, id`,
  ]).catch((error: unknown) => {
    // Older catalogues can still be browsed before the optional CMS migration is applied.
    if (error && typeof error === "object" && "code" in error && error.code === "42P01" &&
      "message" in error && /relation "(?:content_modules|content_collections|author_profiles)" does not exist/.test(String(error.message))) {
      console.warn("Editorial tables are missing; apply the publishing migration to enable CMS content.");
      return [[], [], []];
    }
    throw error;
  });
  return { modules: modules as ContentModule[], collections: collections as Collection[], authors: authors as AuthorProfile[] };
}

export async function getAdminContent(section: ContentSection): Promise<Record<string, unknown>[]> {
  if (section === "collections") return await sql`select *, description body, updated_at::text, publish_at::text from content_collections order by sort, slug`;
  if (section === "authors") return await sql`select *, name title, bio body, photo_url image_url, updated_at::text, publish_at::text from author_profiles order by name`;
  if (section === "media" || section === "testimonials") return await sql`select *, updated_at::text, publish_at::text from content_modules where type=${section === "media" ? "media" : "testimonial"} order by sort, id`;
  return await sql`select *, updated_at::text, publish_at::text, ends_at::text from content_modules where type not in ('media','testimonial') order by sort, id`;
}
export async function saveContent(section: ContentSection, id: string, expected: string | null, input: Record<string, unknown>) {
  const c = validateContent(section, { ...input, ...(section === "media" ? { type: "media" } : section === "testimonials" ? { type: "testimonial" } : {}) });
  if (id.length > 120) throw new ContentError("Invalid record ID.");
  if (expected && !Number.isFinite(Date.parse(expected))) throw new ContentError("Invalid edit version.");
  if (c.type === "collection" && section === "modules") {
    const target = await sql`select slug from content_collections where slug=${String(c.payload.collection_slug ?? "")}`;
    if (!target.length) throw new ContentError("Choose a saved collection.");
  }
  if (c.type === "author" && section === "modules") {
    const target = await sql`select id from author_profiles where id=${String(c.payload.author_id ?? "")}`;
    if (!target.length) throw new ContentError("Choose a saved author.");
  }
  if (c.type === "testimonial" && (!c.payload.attribution || !(c.body || c.payload.quote))) throw new ContentError("A testimonial requires a quote and attribution.");
  let rows;
  if (section === "collections") {
    const books = await sql`select slug from books where slug in (select jsonb_array_elements_text(${JSON.stringify(c.book_slugs)}::jsonb))`;
    if (books.length !== c.book_slugs.length) throw new ContentError("One or more selected books do not exist.");
    if (id && id !== c.slug) throw new ContentError("A saved collection slug cannot be changed.");
    rows = await sql`with changed as (
      insert into content_collections(slug,title,description,image_url,book_slugs,sort,status,publish_at)
      values(${c.slug},${c.title},${c.body},${c.image_url},${JSON.stringify(c.book_slugs)}::jsonb,${c.sort},${c.status},${c.publish_at}::timestamptz)
      on conflict(slug) do update set title=excluded.title,description=excluded.description,image_url=excluded.image_url,book_slugs=excluded.book_slugs,sort=excluded.sort,status=excluded.status,publish_at=excluded.publish_at,updated_at=now()
      where content_collections.updated_at=${expected}::timestamptz returning slug
    ), audit as (insert into publishing_audit(actor_id,action,payload) select 'admin','content.collection.saved',jsonb_build_object('slug',slug) from changed)
    select slug from changed`;
  } else if (section === "authors") {
    rows = await sql`with changed as (
      insert into author_profiles(id,name,bio,photo_url,status,publish_at) values(${id || randomUUID()},${c.title},${c.body},${c.image_url},${c.status},${c.publish_at}::timestamptz)
      on conflict(id) do update set name=excluded.name,bio=excluded.bio,photo_url=excluded.photo_url,status=excluded.status,publish_at=excluded.publish_at,updated_at=now()
      where author_profiles.updated_at=${expected}::timestamptz returning id
    ), audit as (insert into publishing_audit(actor_id,action,payload) select 'admin','content.author.saved',jsonb_build_object('id',id) from changed)
    select id from changed`;
  } else {
    rows = await sql`with changed as (
      insert into content_modules(id,type,title,body,image_url,mobile_image_url,link_url,link_label,payload,sort,status,publish_at,ends_at)
      values(${id || randomUUID()},${c.type},${c.title},${c.body},${c.image_url},${c.mobile_image_url},${c.link_url},${c.link_label},${JSON.stringify(c.payload)}::jsonb,${c.sort},${c.status},${c.publish_at}::timestamptz,${c.ends_at}::timestamptz)
      on conflict(id) do update set type=excluded.type,title=excluded.title,body=excluded.body,image_url=excluded.image_url,mobile_image_url=excluded.mobile_image_url,link_url=excluded.link_url,link_label=excluded.link_label,payload=excluded.payload,sort=excluded.sort,status=excluded.status,publish_at=excluded.publish_at,ends_at=excluded.ends_at,updated_at=now()
      where content_modules.updated_at=${expected}::timestamptz returning id
    ), audit as (insert into publishing_audit(actor_id,action,payload) select 'admin','content.module.saved',jsonb_build_object('id',id) from changed)
    select id from changed`;
  }
  if (!rows.length) throw new ContentError("Record changed. Reload before saving again.");
}
export async function deleteContent(section: ContentSection, id: string, expected: string) {
  if (!id || id.length > 120 || !Number.isFinite(Date.parse(expected))) throw new ContentError("Invalid record or edit version.");
  let rows;
  if (section === "collections") rows = await sql`with changed as (delete from content_collections where slug=${id} and updated_at=${expected}::timestamptz returning slug id), audit as (insert into publishing_audit(actor_id,action,payload) select 'admin','content.collection.deleted',jsonb_build_object('id',id) from changed) select id from changed`;
  else if (section === "authors") rows = await sql`with changed as (delete from author_profiles p where p.id=${id} and p.updated_at=${expected}::timestamptz and not exists(select 1 from publishing_submissions s where s.author_id=p.id) returning id), audit as (insert into publishing_audit(actor_id,action,payload) select 'admin','content.author.deleted',jsonb_build_object('id',id) from changed) select id from changed`;
  else rows = await sql`with changed as (delete from content_modules where id=${id} and updated_at=${expected}::timestamptz returning id), audit as (insert into publishing_audit(actor_id,action,payload) select 'admin','content.module.deleted',jsonb_build_object('id',id) from changed) select id from changed`;
  if (!rows.length) throw new ContentError("Record changed or has submissions. Reload before deleting.");
}

// Moves a module one place among modules of its type and renumbers them 0, 10, 20... in one audited statement.
export async function moveModule(id: string, direction: string) {
  if (direction !== "up" && direction !== "down") throw new ContentError("Invalid direction.");
  const target = await sql`select type from content_modules where id=${id}` as { type: string }[];
  if (!target.length) throw new ContentError("Module not found.");
  const list = (await sql`select id from content_modules where type=${target[0].type} order by sort, id` as { id: string }[]).map((r) => r.id);
  const i = list.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await sql`with ordered as (
      select value as id, ((ordinality - 1) * 10)::int as sort from jsonb_array_elements_text(${JSON.stringify(list)}::jsonb) with ordinality
    ), changed as (update content_modules m set sort=ordered.sort, updated_at=now() from ordered where m.id=ordered.id returning m.id),
    audit as (insert into publishing_audit(actor_id,action,payload)
      select 'admin','content.module.moved',jsonb_build_object('id',${id}::text,'direction',${direction}::text) where exists(select 1 from changed))
    select count(*)::int as n from changed`;
}
