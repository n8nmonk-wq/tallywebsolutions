// Isolated-preview demo data only. Covers are generated typography, clearly fictional titles.
// Production loads it only through the admin "Load demo catalogue" switch (src/lib/demo-store.ts).
import crypto from 'node:crypto';

const CATEGORIES = [
  ['gst-compliance', 'GST and compliance', '#2e2e7e'], ['payments-reminders', 'Payment reminders', '#1f1f5e'],
  ['vouchers-entry', 'Vouchers and bulk entry', '#33337a'], ['banking', 'Banking', '#3a3a88'],
  ['invoice-printing', 'Invoice and print', '#4a4aa0'], ['reports-dashboards', 'Reports and dashboards', '#299637'],
  ['inventory-manufacturing', 'Inventory and manufacturing', '#1d6b33'],
];
// Preview listings modelled on Tallywebsolutions' catalogue categories. Not real products.
const TITLES = {
  'gst-compliance': ['GSTR 2B Reconciliation Module', 'GST Return Checker', 'HSN-wise Sales Summary', 'GST Rate Mapping Helper', 'Input Tax Credit Tracker', 'E-Way Bill Register', 'GSTIN Check on Vouchers', 'Monthly GST Reminder Alerts', 'Reverse Charge Voucher Helper'],
  'payments-reminders': ['Payment Outstanding Follow-ups', 'Payment Due Dashboard', 'Customer Ageing Analysis', 'Auto Reminder Messages', 'Payment Receipt Reminders', 'Overdue Invoice Alerts', 'Bill-wise Outstanding Report', 'Cheque Deposit Reminders', 'Credit Limit Alerts'],
  'vouchers-entry': ['Advanced Bulk Voucher Entries', 'Random Bulk Voucher Generator', 'Quantity and Rate Entry Column', 'Auto Narration in Vouchers', 'Stop Cash Payment Above Limit', 'Salesman Commission Module', 'Voucher Details Without Opening', 'Daybook Voucher Quick View', 'Cash and Bank Receipt Auto Entry'],
  banking: ['Bank Statement Import', 'Auto Suggest Ledger Names', 'Bank Reconciliation Helper', 'Bank Charges Auto Posting', 'Cheque Register Print', 'UPI Payment Entry Helper', 'Bank Balance Dashboard', 'Ledger Name Mapping Rules', 'Bank Transfer Voucher Shortcut'],
  'invoice-printing': ['Advance Seal and Signature on Invoice', 'Attach Image in Invoice Print', 'UPI QR Code on Invoice', 'Dispatch Details on Sales Invoice', 'Total Quantity with Units on Invoice', 'Custom Invoice Header Layout', 'Delivery Challan Print Format', 'Narration Print on Ledger Statement', 'PDF Invoice Export Layout'],
  'reports-dashboards': ['Stock Dashboard with Item Images', 'Item-wise Sales Register', 'Item-wise Purchase Register', 'Group Voucher Columnar Report', 'Company Summary Dashboard', 'Party-wise Profit Report', 'Daily Sales Snapshot', 'Ledger Statement with Balances', 'Multi-company MIS Report'],
  'inventory-manufacturing': ['Barcode Scan Item Merge in POS', 'Godown Name in Stock Summary', 'Stock Group on Vouchers', 'Batch-wise Stock Report', 'Reorder Level Alerts', 'Manufacturing Journal Helper', 'Stock Valuation Snapshot', 'Physical Stock Count Sheet', 'Bill of Materials Lookup'],
};
const AUTHORS = ['Tallywebsolutions'];
const LANGUAGES = ['English', 'English', 'Hindi', 'Gujarati', 'Marathi', 'English'];
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
  const authors = AUTHORS.map(name => ({ id: `demo-${slugify(name)}`, name, bio: 'Tally TDL add-ons, GST tools and reports for TallyPrime users. (Demo profile.)' }));
  const books = [];
  let n = 0;
  for (const [slug, , colour] of CATEGORIES) {
    for (const title of TITLES[slug]) {
      const author = authors[n % authors.length];
      const price = [19900, 24900, 29900, 34900, 44900, 59900][n % 6];
      books.push({
        slug: `demo-${slugify(title)}`, title, category_slug: slug, authorship: author.name, author_slug: author.id,
        description: `${title} is a preview listing used to show the store at full scale. It is not a real add-on.`,
        cover: demoCover(title, author.name, n), price_inr: price,
        sale_price_inr: n % 3 === 0 ? Math.round(price * 0.8 / 100) * 100 : null,
        release_date: n % 11 === 0 ? day(10 + n) : day(-30 - n), language: LANGUAGES[n % LANGUAGES.length],
        file_format: 'PDF', pages: null, year: 2020 + (n % 6),
        publisher: 'Tallywebsolutions', facts: { _demo: 'true' }, sort: 100 + n,
      });
      n++;
    }
  }
  const orders = books.slice(0, 15).map((book, i) => ({
    id: `demo-order-${i}`, items: [{ slug: book.slug, title: book.title, price: book.price_inr }],
    total: book.price_inr, count: 15 - i,
  }));
  const modules = [
    { id: 'demo-announcement', type: 'announcement', title: 'Lifetime validity and free updates on every TDL add-on', link_url: '/search', sort: 0 },
    { id: 'demo-banner-1', type: 'banner', title: 'TallyPrime add-ons', body: 'GST, banking, invoicing and reports, ready to install', link_url: '/search', link_label: 'Shop add-ons', payload: { subtitle: 'Instant download', theme: 'sky' }, sort: 1 },
    { id: 'demo-banner-2', type: 'banner', title: 'New add-ons', body: 'Fresh TDL source code added regularly', link_url: '/search?sort=new', link_label: 'See new add-ons', payload: { subtitle: 'Just in', theme: 'yellow' }, sort: 2 },
    { id: 'demo-banner-3', type: 'banner', title: 'Tally GST reconciliation', body: 'Match GSTR 2B with your purchase register', link_url: '/category/gst-compliance', link_label: 'View GST add-ons', payload: { subtitle: 'Popular', theme: 'green' }, sort: 3 },
    { id: 'demo-promo-1', type: 'promo', title: 'GST and compliance tools', link_url: '/category/gst-compliance', payload: { size: 'large', category_slug: 'gst-compliance', theme: 'green' }, sort: 4 },
    { id: 'demo-promo-2', type: 'promo', title: 'Payment reminders', link_url: '/category/payments-reminders', payload: { size: 'small', theme: 'ink' }, sort: 5 },
    { id: 'demo-promo-3', type: 'promo', title: 'Dashboards and reports', link_url: '/category/reports-dashboards', payload: { size: 'small', theme: 'sky' }, sort: 6 },
    { id: 'demo-promo-4', type: 'promo', title: 'Invoice and print formats', link_url: '/category/invoice-printing', payload: { size: 'small', theme: 'yellow' }, sort: 7 },
    { id: 'demo-genres', type: 'genre-switcher', title: 'Find your add-on', payload: { category_slugs: ['gst-compliance', 'payments-reminders', 'vouchers-entry', 'banking', 'invoice-printing'] }, sort: 8 },
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
