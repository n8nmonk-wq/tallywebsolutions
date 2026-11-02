// Isolated-preview demo data only. Covers are generated typography, clearly fictional titles.
// Production loads it only through the admin "Load demo catalogue" switch (src/lib/demo-store.ts).
import crypto from 'node:crypto';

const CATEGORIES = [
  ['fiction', 'Fiction', '#F04E37'], ['mystery-thriller', 'Mystery and thriller', '#1F2937'],
  ['romance', 'Romance', '#DB2777'], ['science', 'Science', '#2563EB'], ['health-wellness', 'Health and wellness', '#16A34A'],
  ['ayurveda', 'Ayurveda', '#15803D'], ['business', 'Business', '#B45309'], ['self-help', 'Self-help', '#7C3AED'],
  ['history', 'History', '#92400E'], ['children', 'Children', '#F59E0B'], ['biography', 'Biography', '#0F766E'],
  ['technology', 'Technology', '#0EA5E9'],
];
const TITLES = {
  fiction: ['The Monsoon Ledger', 'A House on Juhu Lane', 'Paper Boats', 'The Ninth Platform', 'Salt and Saffron'],
  'mystery-thriller': ['Midnight at Colaba', 'The Silent Courier', 'Cipher of the Ghats', 'Dead Reckoning', 'The Ledger Room'],
  romance: ['Letters from Shimla', 'Second Monsoon', 'The Tea Garden', 'Under the Same Stars', 'A Winter in Mussoorie'],
  science: ['The Restless Atom', 'Small Wonders', 'Maps of the Mind', 'The Carbon Story', 'Light Years Away'],
  'health-wellness': ['Everyday Strength', 'The Sleep Reset', 'Mindful Kitchen', 'Breathe Better', 'Walk Your Way'],
  ayurveda: ['Foundations of Rasayana', 'Seasons and the Body', 'Herbs of the Western Ghats', 'Dinacharya Daily', 'The Six Tastes'],
  business: ['Built in Bengaluru', 'The Frugal Founder', 'Pricing with Purpose', 'Teams That Ship', 'The Long Game'],
  'self-help': ['Small Steps', 'The Focus Habit', 'Quiet Confidence', 'Unhurried', 'Begin Again'],
  history: ['Empires of the Deccan', 'The Silk Road Diaries', 'Ports of the Malabar', 'Letters from 1857', 'Stone and Script'],
  children: ['Moti the Brave Elephant', 'The Kite That Flew Home', 'Counting Mangoes', 'Riya and the Rain', 'Stars Over Ladakh'],
  biography: ['A Life in Ink', 'The Engineer of Dams', 'Notes of a Physician', 'Voices of the Valley', 'The Quiet Reformer'],
  technology: ['Code for Everyone', 'Data, Plainly', 'The Secure Web', 'Machines That Learn', 'Designing for People'],
};
const AUTHORS = ['Ananya Rao', 'Vikram Mehta', 'Meera Iyer', 'Arjun Kapoor', 'Kavya Nair', 'Rohan Desai', 'Ishita Sen', 'Farhan Qureshi', 'Leela Menon', 'Dev Malhotra'];
const LANGUAGES = ['English', 'English', 'English', 'Hindi', 'Marathi', 'Tamil', 'Gujarati', 'Telugu'];
const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const escapeXml = value => value.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

// Demo covers (isolated preview only) use the theme palette: deep greens and ink with cream type and gold rules.
const COVER_COLOURS = ['#161641', '#1f1f55', '#1f1f5e', '#2e2e7e', '#1f1f2b', '#44444f', '#1d6b33'];
const COVER_SHAPES = [
  '<rect x="28" y="300" width="244" height="1" fill="#299637"/><rect x="28" y="306" width="120" height="1" fill="#299637"/>',
  '<circle cx="230" cy="340" r="78" fill="none" stroke="#299637" stroke-opacity=".7" stroke-width="1.5"/><circle cx="230" cy="340" r="46" fill="none" stroke="#c5ecd3" stroke-opacity=".35"/>',
  '<path d="M28 360 Q150 300 272 360" fill="none" stroke="#299637" stroke-width="1.5"/><path d="M28 380 Q150 320 272 380" fill="none" stroke="#c5ecd3" stroke-opacity=".4"/>',
  '<rect x="28" y="230" width="244" height="150" fill="none" stroke="#c5ecd3" stroke-opacity=".35"/><rect x="44" y="246" width="212" height="118" fill="none" stroke="#299637" stroke-opacity=".7"/>',
];
export function demoCover(title, author, seed = 0) {
  const words = title.split(' ');
  const lines = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && (last + ' ' + word).length <= 14) lines[lines.length - 1] = last + ' ' + word; else lines.push(word);
  }
  const colour = COVER_COLOURS[(seed * 5) % COVER_COLOURS.length];
  const text = lines.map((line, i) => `<text x="28" y="${86 + i * 34}" font-family="Helvetica,Arial,sans-serif" font-size="28" font-weight="500" letter-spacing="-1" fill="#eef0fa">${escapeXml(line)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">`
    + `<rect width="300" height="450" fill="${colour}"/>${COVER_SHAPES[seed % COVER_SHAPES.length]}${text}`
    + `<text x="28" y="418" font-family="Menlo,Consolas,monospace" font-size="12" letter-spacing="1.5" fill="#c5ecd3">${escapeXml(author.toUpperCase())}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function demoCatalogue(now = new Date()) {
  const day = offset => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const categories = CATEGORIES.map(([slug, name, colour], sort) => ({ slug, name, colour, sort }));
  const authors = AUTHORS.map(name => ({ id: `demo-${slugify(name)}`, name, bio: `${name} writes for readers who like their ideas clear and their stories honest. (Demo author.)` }));
  const books = [];
  let n = 0;
  for (const [slug, , colour] of CATEGORIES) {
    for (const title of TITLES[slug]) {
      const author = authors[n % authors.length];
      const price = [19900, 24900, 29900, 34900, 44900, 59900][n % 6];
      books.push({
        slug: `demo-${slugify(title)}`, title, category_slug: slug, authorship: author.name, author_slug: author.id,
        description: `${title} is a demo listing used to preview the store at full scale. It is not a real book.`,
        cover: demoCover(title, author.name, n), price_inr: price,
        sale_price_inr: n % 3 === 0 ? Math.round(price * 0.8 / 100) * 100 : null,
        release_date: n % 11 === 0 ? day(10 + n) : day(-30 - n), language: LANGUAGES[n % LANGUAGES.length],
        file_format: n % 4 === 0 ? 'EPUB' : 'PDF', pages: 120 + (n * 37) % 400, year: 2020 + (n % 6),
        publisher: 'Demo Press', facts: { _demo: 'true' }, sort: 100 + n,
      });
      n++;
    }
  }
  const orders = books.slice(0, 15).map((book, i) => ({
    id: `demo-order-${i}`, items: [{ slug: book.slug, title: book.title, price: book.price_inr }],
    total: book.price_inr, count: 15 - i,
  }));
  const modules = [
    { id: 'demo-announcement', type: 'announcement', title: 'Festive reads: up to 20% off selected titles', link_url: '/search?offer=1', sort: 0 },
    { id: 'demo-banner-1', type: 'banner', title: 'Festive reading week', body: 'Up to 20% off across fiction, science and more', link_url: '/search?offer=1', link_label: 'Shop offers', payload: { subtitle: 'Limited time', theme: 'coral' }, sort: 1 },
    { id: 'demo-banner-2', type: 'banner', title: 'New this month', body: 'Fresh titles from independent authors', link_url: '/search?sort=new', link_label: 'See new arrivals', payload: { subtitle: 'Just in', theme: 'sky' }, sort: 2 },
    { id: 'demo-banner-3', type: 'banner', title: 'Publish with us', body: 'Reach readers across India in digital editions', link_url: '/publish', link_label: 'Start publishing', payload: { subtitle: 'For authors', theme: 'yellow' }, sort: 3 },
    { id: 'demo-promo-1', type: 'promo', title: 'Ayurveda essentials', link_url: '/category/ayurveda', payload: { size: 'large', category_slug: 'ayurveda', theme: 'green' }, sort: 4 },
    { id: 'demo-promo-2', type: 'promo', title: 'Thrillers to stay up for', link_url: '/category/mystery-thriller', payload: { size: 'small', theme: 'ink' }, sort: 5 },
    { id: 'demo-promo-3', type: 'promo', title: 'Big ideas in science', link_url: '/category/science', payload: { size: 'small', theme: 'sky' }, sort: 6 },
    { id: 'demo-promo-4', type: 'promo', title: 'Stories for little readers', link_url: '/category/children', payload: { size: 'small', theme: 'yellow' }, sort: 7 },
    { id: 'demo-genres', type: 'genre-switcher', title: 'Find your genre', payload: { category_slugs: ['fiction', 'mystery-thriller', 'romance', 'science', 'business'] }, sort: 8 },
  ];
  return { categories, authors, books, orders, modules };
}

export async function seedDemo(db) {
  const data = demoCatalogue();
  const sha = crypto.createHash('sha256').update('demo').digest('hex');
  for (const c of data.categories)
    await db.query(`insert into categories(slug,name,colour,sort) values($1,$2,$3,$4) on conflict (slug) do nothing`, [c.slug, c.name, c.colour, c.sort]);
  for (const a of data.authors)
    await db.query(`insert into author_profiles(id,name,bio,status) values($1,$2,$3,'published') on conflict (id) do nothing`, [a.id, a.name, a.bio]);
  for (const b of data.books)
    await db.query(`insert into books(slug,title,category_slug,authorship,author_slug,description,cover,price_inr,sale_price_inr,release_date,
        language,file_format,pages,year,publisher,facts,sort,file_url,file_sha256,release_approved,scan_status,subject)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,'private:demo.pdf',$18,true,'clean',
        (select name from categories where slug=$3)) on conflict (slug) do nothing`,
    [b.slug, b.title, b.category_slug, b.authorship, b.author_slug, b.description, b.cover, b.price_inr, b.sale_price_inr, b.release_date,
      b.language, b.file_format, b.pages, b.year, b.publisher, JSON.stringify(b.facts), b.sort, sha]);
  for (const o of data.orders)
    for (let i = 0; i < o.count; i++)
      await db.query(`insert into orders(id,email,items,subtotal,total,status,created_at) values($1,'demo@example.com',$2::jsonb,$3,$3,'fulfilled',now() - ($4 || ' days')::interval)
        on conflict (id) do nothing`, [`${o.id}-${i}`, JSON.stringify(o.items), o.total, String(i + 1)]);
  for (const m of data.modules)
    await db.query(`insert into content_modules(id,type,title,body,link_url,link_label,payload,sort,status)
      values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'published') on conflict (id) do nothing`,
    [m.id, m.type, m.title, m.body || null, m.link_url || null, m.link_label || null, JSON.stringify(m.payload || {}), m.sort]);
}
