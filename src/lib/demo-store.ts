import crypto from "node:crypto";
import { sql, logEvent } from "./db";
// Shared with the isolated preview (scripts/isolated-db.mjs).
import { demoCatalogue } from "./demo-catalogue.mjs";

type Demo = {
  categories: { slug: string; name: string; colour: string; sort: number }[];
  authors: { id: string; name: string; bio: string }[];
  books: Record<string, unknown>[];
  modules: { id: string; type: string; title: string; body?: string; link_url?: string; link_label?: string; payload?: object; sort: number }[];
};

// Demo rows are marked (books: facts._demo, authors and modules: "demo-" ids) so removal never touches real content.
// Demo books display a price but checkout refuses them (see api/checkout), so nobody can pay for one.
export async function loadDemo(now = new Date()) {
  const data = demoCatalogue(now) as Demo;
  const sha = crypto.createHash("sha256").update("demo").digest("hex");
  const json = (v: unknown) => JSON.stringify(v);
  await sql`insert into categories(slug,name,colour,sort)
    select slug,name,colour,sort from jsonb_to_recordset(${json(data.categories)}::jsonb) as x(slug text,name text,colour text,sort int)
    on conflict (slug) do nothing`;
  await sql`insert into author_profiles(id,name,bio,status)
    select id,name,bio,'published' from jsonb_to_recordset(${json(data.authors)}::jsonb) as x(id text,name text,bio text)
    on conflict (id) do nothing`;
  await sql`insert into books(slug,title,category_slug,authorship,author_slug,description,cover,price_inr,sale_price_inr,release_date,
      language,file_format,pages,year,publisher,facts,sort,file_url,file_sha256,release_approved,scan_status,subject)
    select x.slug,x.title,x.category_slug,x.authorship,x.author_slug,x.description,x.cover,x.price_inr,x.sale_price_inr,x.release_date::date,
      x.language,x.file_format,x.pages,x.year,x.publisher,x.facts,x.sort,'private:demo.pdf',${sha},true,'clean',c.name
    from jsonb_to_recordset(${json(data.books)}::jsonb) as x(slug text,title text,category_slug text,authorship text,author_slug text,description text,
      cover text,price_inr int,sale_price_inr int,release_date text,language text,file_format text,pages int,year int,publisher text,facts jsonb,sort int)
    left join categories c on c.slug = x.category_slug
    on conflict (slug) do nothing`;
  await sql`insert into content_modules(id,type,title,body,link_url,link_label,payload,sort,status)
    select id,type,title,body,link_url,link_label,coalesce(payload,'{}'::jsonb),sort,'published'
    from jsonb_to_recordset(${json(data.modules)}::jsonb) as x(id text,type text,title text,body text,link_url text,link_label text,payload jsonb,sort int)
    on conflict (id) do nothing`;
  // Real titles without a subject join Ayurveda, so they show in the menu and subject tiles; change it per book in admin.
  await sql`update books set category_slug='ayurveda', subject=coalesce(subject,'Ayurveda'), language=coalesce(language,'English')
    where category_slug is null and not coalesce(third_party,false) and coalesce(facts->>'_demo','') <> 'true'`;
  await logEvent(null, "admin.demo.loaded", { books: data.books.length });
}

export async function removeDemo() {
  const data = demoCatalogue() as Demo;
  await sql`delete from books where facts->>'_demo' = 'true'`;
  await sql`delete from content_modules where id like 'demo-%'`;
  await sql`delete from author_profiles where id like 'demo-%' and not exists (select 1 from books b where b.author_slug = author_profiles.id)`;
  await sql`delete from categories where slug = any(${data.categories.map((c) => c.slug)})
    and not exists (select 1 from books b where b.category_slug = categories.slug)
    and not exists (select 1 from categories child where child.parent_slug = categories.slug)`;
  await logEvent(null, "admin.demo.removed", {});
}

export async function demoCount() {
  const rows = await sql`select count(*)::int as n from books where facts->>'_demo' = 'true'` as { n: number }[];
  return rows[0]?.n ?? 0;
}
