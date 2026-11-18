import { FILE_TYPE_LIST, FILE_TYPES, normaliseFileType } from "@/lib/file-types";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { checkOrigin } from '@/lib/reader-auth';
import { PublishingError, readLimitedForm, releaseExistingBook } from '@/lib/submissions';
import { ContentError, safeUrl, textField } from '@/lib/content';
import { parseSale } from '@/lib/admin-catalogue';
import { putOnSale, setRegularPrice, SaleError } from '@/lib/admin-sale';
import { slugify } from '@/lib/slug';

export const runtime = "nodejs";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BULK_LIMIT = 200;

/** Bulk actions from the products list: show, hide or delete several first-party products at once. */
async function bulk(form: FormData) {
  const op = form.get('op');
  if (op !== 'show' && op !== 'hide' && op !== 'delete') throw new PublishingError('Choose a bulk action.');
  if ([...form.keys()].some(key => !['action', 'op', 'slugs', 'confirmed', 'back'].includes(key)) || form.getAll('op').length !== 1) throw new PublishingError('Invalid product fields.');
  const slugs = [...new Set(form.getAll('slugs').map(v => textField(v, 101, true)))];
  if (!slugs.length) throw new PublishingError('Select at least one product.');
  if (slugs.length > BULK_LIMIT || slugs.some(slug => !SLUG.test(slug))) throw new PublishingError('Invalid product selection.');
  if (op === 'delete') {
    if (form.get('confirmed') !== 'on') throw new PublishingError('Confirm permanent deletion.');
    const removed = await sql`with removed as (
      delete from books b where b.slug = any(${slugs}::text[]) and not coalesce(b.third_party,false)
        and not exists (select 1 from orders o where o.items @> jsonb_build_array(jsonb_build_object('slug',b.slug)))
        and not exists (select 1 from downloads d where d.book_slug=b.slug)
        and not exists (select 1 from wishlist w where w.book_slug=b.slug)
      returning slug
    ), audit as (insert into events(order_id,type,payload)
      select null,'admin.book.deleted',jsonb_build_object('slug',slug,'bulk',true) from removed)
    select slug from removed`;
    const kept = slugs.length - removed.length;
    return `Deleted ${removed.length} of ${slugs.length} products.` + (kept ? ` ${kept} kept: products with orders, wishlists or developer submissions cannot be deleted; remove them from the store instead.` : '');
  }
  const changed = await sql`with changed as (
    update books set active=${op === 'show'} where slug = any(${slugs}::text[]) and not coalesce(third_party,false) returning slug
  ), audit as (insert into events(order_id,type,payload)
    select null,${op === 'hide' ? 'admin.book.hidden' : 'admin.book.shown'},jsonb_build_object('slug',slug,'bulk',true) from changed)
  select slug from changed`;
  const skipped = slugs.length - changed.length;
  return `${op === 'show' ? 'Restored' : 'Removed'} ${changed.length} ${changed.length === 1 ? 'product' : 'products'} ${op === 'show' ? 'to' : 'from'} the store.` + (skipped ? ` ${skipped} skipped: developer submissions change visibility from their own page.` : '');
}

const revalidateStore = (slug?: string) => {
  revalidatePath("/");
  revalidatePath('/catalogue');
  if (slug) { revalidatePath(`/products/${slug}`); revalidatePath(`/admin/products/${slug}`); }
  else revalidatePath('/products/[slug]', 'page');
  revalidatePath('/admin/products');
  revalidatePath('/search');
  revalidatePath('/category/[slug]', 'page');
};

/** Product editing. Prices are in rupees on the wire, paise in the DB. */
export async function POST(req: Request) {
  if (!checkOrigin(req)) return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  // Where a browser form goes back to: the list for list actions, the product's own page otherwise.
  let back = '/admin/products';
  try {
    const form = await readLimitedForm(req, 200000);
    if (form.get('action') === 'bulk') {
      const message = await bulk(form);
      revalidateStore();
      // Back to the same search, filter and page the admin was looking at.
      const sent = new URLSearchParams(textField(form.get('back'), 400));
      const list = new URLSearchParams();
      for (const key of ['q', 'status', 'page']) { const value = sent.get(key); if (value) list.set(key, value.slice(0, 100)); }
      list.set('notice', message);
      return NextResponse.redirect(new URL(`/admin/products?${list.toString().replace(/\+/g, "%20")}`, req.url), 303);
    }
    const action = form.get('action') ?? 'save';
    // A new product's web address comes from its name unless the admin typed one.
    let slug = textField(form.get('slug'), 101, action !== 'create');
    if (action === 'create' && !slug) slug = slugify(textField(form.get('title'), 200, true));
    if (!SLUG.test(slug)) throw new PublishingError(action === 'create' ? 'Use letters or numbers in the name, or type a web address like gst-party-finder.' : 'Invalid product slug.');
    if (action !== 'create' && action !== 'delete') back = `/admin/products/${encodeURIComponent(slug)}`;
    const allowed = action === 'release' ? ['action', 'slug', 'submission_id', 'reason', 'confirmed']
      : action === 'archive' || action === 'restore' ? ['action', 'slug', 'reason', 'confirmed']
      : action === 'create' ? ['action', 'slug', 'title']
      : action === 'pricing' ? ['action', 'slug', 'sale_price', 'sale_starts_at', 'sale_ends_at']
      : action === 'put-on-sale' ? ['action', 'slug']
      : action === 'delete' ? ['action', 'slug', 'confirmed']
      : action === 'hide' || action === 'show' ? ['action', 'slug']
      : action === 'price' ? ['action', 'slug', 'price']
      : ['action', 'slug', 'title', 'subtitle', 'price_inr', 'publisher', 'isbn', 'pages', 'year', 'cover', 'description', 'long_description', 'authorship', 'facts', 'highlights', 'active',
         'category_slug', 'release_date', 'language', 'edition', 'file_format', 'author_slug'];
    if (!['save', 'release', 'archive', 'restore', 'create', 'pricing', 'put-on-sale', 'price', 'hide', 'show', 'delete'].includes(String(action)) || [...form.keys()].some(key => !allowed.includes(key) || form.getAll(key).length !== 1)) throw new PublishingError('Invalid product fields.');
    if (action === 'delete') {
      if (form.get('confirmed') !== 'on') throw new PublishingError('Confirm permanent deletion.');
      const rows = await sql`with removed as (
        delete from books b where b.slug=${slug} and not coalesce(b.third_party,false)
          and not exists (select 1 from orders o where o.items @> jsonb_build_array(jsonb_build_object('slug',b.slug)))
          and not exists (select 1 from downloads d where d.book_slug=b.slug)
          and not exists (select 1 from wishlist w where w.book_slug=b.slug)
        returning slug
      ), audit as (insert into events(order_id,type,payload)
        select null,'admin.book.deleted',jsonb_build_object('slug',slug) from removed)
      select slug from removed`;
      if (!rows.length) throw new PublishingError('Cannot delete this product: it may have orders, saved wishlists, or be a reviewed submission. Remove it from the store instead.', 409);
    } else if (action === 'hide' || action === 'show') {
      const rows = await sql`with changed as (
        update books set active=${action === 'show'} where slug=${slug} and not third_party returning slug
      ), audit as (insert into events(order_id,type,payload)
        select null,${action === 'hide' ? 'admin.book.hidden' : 'admin.book.shown'},jsonb_build_object('slug',slug) from changed)
      select slug from changed`;
      if (!rows.length) throw new PublishingError('Add-on not found.', 404);
    } else if (action === 'put-on-sale') {
      await putOnSale(sql, { slug, root: process.cwd() });
    } else if (action === 'price') {
      await setRegularPrice(sql, { slug, rupees: textField(form.get('price'), 20, true) });
    } else if (action === 'release') {
      await releaseExistingBook(textField(form.get('submission_id'), 120, true), slug, textField(form.get('reason'), 2000, true), form.get('confirmed') === 'on');
    } else if (action === 'archive' || action === 'restore') {
      const reason = textField(form.get('reason'), 2000, true);
      if (reason.length < 10 || form.get('confirmed') !== 'on') throw new PublishingError('A reason and explicit confirmation are required.');
      const rows = await sql`with changed as (
        update books set active=${action === 'restore'} where slug=${slug} and third_party returning slug,submission_id,release_approved
      ), audit as (insert into events(order_id,type,payload)
        select null,${action === 'archive' ? 'admin.book.archived' : 'admin.book.restored'},
          jsonb_build_object('slug',slug,'submission_id',submission_id,'release_approved',release_approved,'reason',${reason}::text) from changed)
      select slug from changed`;
      if (!rows.length) throw new PublishingError('Visibility actions require an existing third-party publication.', 409);
    } else if (action === 'create') {
      const title = textField(form.get('title'), 200, true);
      // Two products can share a name; the second gets -2, the third -3, and so on.
      const base = slug;
      let rows: Record<string, unknown>[] = [];
      for (let n = 1; n <= 20 && !rows.length; n++) {
        const candidate = n === 1 ? base : `${base.slice(0, 101 - String(n).length - 1)}-${n}`;
        rows = await sql`with created as (
          insert into books(slug,title,price_inr,active,release_approved) values(${candidate},${title},0,false,false)
          on conflict (slug) do nothing returning slug
        ), audit as (insert into events(order_id,type,payload) select null,'admin.book.created',jsonb_build_object('slug',slug) from created)
        select slug from created`;
        if (rows.length) slug = candidate;
      }
      if (!rows.length) throw new PublishingError('Too many products already use that web address. Type a different one.', 409);
    } else if (action === 'pricing') {
      const current = await sql`select price_inr from books where slug=${slug}` as { price_inr: number }[];
      if (!current.length) throw new PublishingError('Product not found.', 404);
      const sale = parseSale(form, current[0].price_inr);
      // Offers change only what is charged, not the file or rights, so the release stands.
      await sql`with changed as (
        update books set sale_price_inr=${sale.sale_price_inr}, sale_starts_at=${sale.sale_starts_at}::timestamptz, sale_ends_at=${sale.sale_ends_at}::timestamptz
        where slug=${slug} returning slug
      ), audit as (insert into events(order_id,type,payload) select null,'admin.book.pricing',jsonb_build_object('slug',slug,'sale_price_inr',${sale.sale_price_inr}::int,'starts',${sale.sale_starts_at}::text,'ends',${sale.sale_ends_at}::text) from changed)
      select slug from changed`;
    } else {
      const books = await sql`select third_party, cover, author_slug from books where slug=${slug}`;
      if (!books.length) throw new PublishingError('Product not found.', 404);
      if (books[0].third_party) throw new PublishingError('Developer submission changes require a new reviewed submission. Only visibility can be changed here.', 409);
      const title = textField(form.get('title'), 200, true);
      const subtitle = textField(form.get('subtitle'), 200);
      const description = textField(form.get('description'), 20000);
      const longDescription = textField(form.get('long_description'), 40000);
      const authorship = textField(form.get('authorship'), 500);
      const publisher = textField(form.get('publisher'), 200);
      const isbn = textField(form.get('isbn'), 32);
      if (isbn && !/^[0-9Xx -]+$/.test(isbn)) throw new PublishingError('Invalid ISBN.');
      // Values sent back unchanged are kept as stored, so a save never fails on a field the admin did not touch.
      const sentCover = form.get('cover');
      const cover = sentCover === (books[0].cover ?? '') ? (books[0].cover as string | null) : safeUrl(sentCover);
      const price = textField(form.get('price_inr'), 20, true);
      const pricePaise = Math.round(Number(price) * 100);
      if (!/^\d+(?:\.\d{1,2})?$/.test(price) || !Number.isSafeInteger(pricePaise) || pricePaise < 0 || pricePaise > 100000000) throw new PublishingError('Invalid price.');
      const integer = (name: string, max: number) => {
        const value = textField(form.get(name), 10);
        if (!value) return null;
        const number = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1 || number > max) throw new PublishingError(`Invalid ${name}.`);
        return number;
      };
      const categorySlug = textField(form.get('category_slug'), 80) || null;
      if (categorySlug && !(await sql`select 1 from categories where slug=${categorySlug}`).length) throw new PublishingError('Choose an existing category.');
      const releaseDate = textField(form.get('release_date'), 10) || null;
      if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new PublishingError('Invalid release date.');
      const language = textField(form.get('language'), 60) || null;
      const edition = textField(form.get('edition'), 120) || null;
      const fileType = normaliseFileType(textField(form.get('file_format'), 10) || 'pdf');
      if (!fileType) throw new PublishingError(`Choose a file type: ${FILE_TYPE_LIST}.`);
      const fileFormat = fileType.toUpperCase();
      const authorSlug = textField(form.get('author_slug'), 120) || null;
      if (authorSlug && authorSlug !== books[0].author_slug && !(await sql`select 1 from author_profiles where id=${authorSlug}`).length) throw new PublishingError('Choose an existing developer profile.');
      const pages = integer('pages', 100000);
      const year = integer('year', 9999);
      const highlights = textField(form.get('highlights'), 10000)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const facts: Record<string, string> = Object.create(null);
      for (const line of textField(form.get('facts'), 10000).split("\n").filter(line => line.trim())) {
        const i = line.indexOf(":");
        if (i < 1) throw new PublishingError('Facts require Key: Value.');
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1).trim();
        if (!k || !v || k.startsWith('_') || k.length > 200 || v.length > 2000) throw new PublishingError('Invalid catalogue fact.');
        facts[k] = v;
      }

      const rows = await sql`with changed as (
        update books set
          title            = ${title},
          subtitle         = ${subtitle || null},
          description      = ${description || null},
          long_description = ${longDescription || null},
          highlights       = ${JSON.stringify(highlights)}::jsonb,
          -- Internal facts survive edits; public facts come from the current form.
          facts            = (
            select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
            from jsonb_each(coalesce(books.facts, '{}'::jsonb)) as t(k, v)
            where left(k,1) = '_'
          ) || ${JSON.stringify(facts)}::jsonb,
          authorship       = ${authorship || null},
          price_inr        = ${pricePaise},
          sale_price_inr   = case when sale_price_inr < ${pricePaise} then sale_price_inr else null end,
          category_slug    = ${categorySlug},
          release_date     = ${releaseDate}::date,
          language         = ${language},
          edition          = ${edition},
          file_format      = ${fileFormat},
          author_slug      = ${authorSlug},
          publisher        = ${publisher || null},
          isbn             = ${isbn || null},
          pages            = ${pages},
          year             = ${year},
          cover            = ${cover},
          release_approved = release_approved and file_format is not distinct from ${fileFormat}, -- detail edits keep the release unless the file format changes
          active           = ${form.get("active") === "on"}
        where slug = ${slug} and not third_party returning slug
      ), audit as (insert into events(order_id,type,payload)
        select null,'admin.book.updated',jsonb_build_object('slug',slug) from changed)
      select slug from changed`;
      if (!rows.length) throw new PublishingError('Product not found.', 404);
    }
    revalidateStore(slug);
    // A new product opens straight into its editor; a deletion goes back to the list.
    const target = action === 'delete' ? `/admin/products?notice=${encodeURIComponent('Product deleted.')}` : `/admin/products/${encodeURIComponent(slug)}?saved=1`;
    return NextResponse.redirect(new URL(target, req.url), 303);
  } catch (error) {
    const known = error instanceof PublishingError || error instanceof ContentError || error instanceof SaleError;
    // Browser form posts go back to the screen they came from with the message; API callers keep JSON.
    if (known && req.headers.get('accept')?.includes('text/html'))
      return NextResponse.redirect(new URL(`${back}?error=${encodeURIComponent((error as Error).message)}`, req.url), 303);
    if (error instanceof SaleError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PublishingError || error instanceof ContentError) return NextResponse.json({ error: error.message }, { status: error instanceof PublishingError ? error.status : 400 });
    console.error('Admin product update failed', error);
    return NextResponse.json({ error: 'Could not save the product.' }, { status: 503 });
  }
}
