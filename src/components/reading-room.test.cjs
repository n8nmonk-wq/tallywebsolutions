const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
let cart = { ready: true, slugs: [], error: "", add() {}, remove() {}, drawerOpen: false, openDrawer() {}, closeDrawer() {}, lastAdded: null };
const cache = new Map();
function load(relative, overrides = {}) {
  if (!Object.keys(overrides).length && cache.has(relative)) return cache.get(relative);
  const filename = path.join(root, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const dependency = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === "./WishlistProvider" || name === "@/components/WishlistProvider") return { useWishlist: () => ({ slugs: [], ready: true, has: () => false, toggle() {} }) };
    if (name === "@/components/CartProvider" || name === "./CartProvider") return { ...load("components/CartProvider.tsx"), useCart: () => cart };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name)).split(path.sep).join("/");
      for (const ext of [".tsx", ".ts"]) if (fs.existsSync(path.join(root, base + ext))) return load(base + ext, overrides);
    }
    return require(name);
  };
  new Function("require", "module", "exports", source)(dependency, module, module.exports);
  if (!Object.keys(overrides).length) cache.set(relative, module.exports);
  return module.exports;
}

const layoutSource = fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8");
assert.match(layoutSource, /@fontsource-variable\/geist"/);
assert.doesNotMatch(layoutSource, /geist-mono/, "labels use the sans font; mono hurt readability");
assert.doesNotMatch(layoutSource, /bricolage|mukta|fraunces|manrope/i);
const tokens = fs.readFileSync(path.join(root, "styles/tokens.css"), "utf8");
for (const token of ["--bg-2: #f8f8fb", "--brand: #2e2e7e", "--gold: #299637", "--forest: #161641", "--ink: #15151f", "--cream: #eef0fa"]) assert.ok(tokens.includes(token), token);
assert.doesNotMatch(fs.readFileSync(path.join(root, "app/globals.css"), "utf8"), /Fraunces|Manrope|Bricolage|Mukta/);
const styleSources = fs.readdirSync(path.join(root, "styles")).map((f) => fs.readFileSync(path.join(root, "styles", f), "utf8")).join("\n")
  + fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
assert.doesNotMatch(styleSources, /--neel|--kumkum|--paper|--mist|--font-head|--font-body|akshara|Bricolage|Mukta|Noto/, "no Akshara-era styles remain");
assert.doesNotMatch(fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8"), /noto-sans/);
// Motion primitives degrade safely and never draw a book inside a mockup.
const { isFlatCover } = load("components/motion/Book3D.tsx", { "motion/react": { ...require("motion/react"), useReducedMotion: () => true } });
assert.equal(isFlatCover("/assets/book1.png"), false, "real covers are finished mockups");
assert.equal(isFlatCover("https://cdn.example.com/cover.jpg"), false);
assert.equal(isFlatCover("data:image/svg+xml;utf8,%3Csvg%3E"), true);
assert.equal(isFlatCover(null), true);
const MorphModule = load("components/motion/Morph.tsx");
assert.equal(MorphModule.morphName("real-book"), "cover-real-book");
const morphed = renderToStaticMarkup(React.createElement(MorphModule.default, { name: "cover-x" }, React.createElement("img", { alt: "x", src: "/x.png" })));
assert.match(morphed, /<img alt="x" src="\/x.png"/, "without ViewTransition the children render unchanged");
const { flightKeyframes, flyToBag } = load("components/motion/fly.ts");
const frames = flightKeyframes({ left: 0, top: 500, width: 100, height: 150 }, { left: 900, top: 10, width: 20, height: 20 });
assert.equal(frames.length, 3);
assert.equal(frames[0].transform, "translate(0px, 0px) scale(1)");
assert.equal(frames[2].transform, "translate(860px, -555px) scale(0.2)");
assert.match(flightKeyframes({ left: 0, top: 0, width: 1000, height: 1000 }, { left: 0, top: 0, width: 1, height: 1 })[2].transform, /scale\(0\.08\)/, "scale is clamped");
assert.doesNotThrow(() => flyToBag(null));
const { buildNav } = load("lib/navigation.ts");
const cats = [
  { slug: "fiction", name: "Fiction", parent_slug: null, sort: 1 }, { slug: "crime", name: "Crime", parent_slug: "fiction", sort: 1 },
  { slug: "science", name: "Science", parent_slug: null, sort: 0 },
  ...Array.from({ length: 8 }, (_, i) => ({ slug: `c${i}`, name: `Cat ${i}`, parent_slug: null, sort: 10 + i })),
];
const nav = buildNav(cats, 7);
assert.deepEqual(nav.primary.slice(0, 2).map(c => c.slug), ["science", "fiction"]);
assert.deepEqual(nav.primary[1].children.map(c => c.slug), ["crime"]);
assert.equal(nav.primary.length, 7);
assert.equal(nav.more.length, 3);
assert.ok(!nav.primary.some(c => c.slug === "crime"), "children never appear as top-level items");
const { parseCart, cartTotals } = load("components/CartProvider.tsx");
assert.deepEqual(parseCart(null), []);
assert.deepEqual(parseCart("not-json"), []);
assert.deepEqual(parseCart('{"slug":"title"}'), []);
assert.deepEqual(parseCart('["real-book","real-book",null,3,"../private","javascript:alert(1)","another-title"]'), ["real-book", "another-title"]);
assert.equal(parseCart(JSON.stringify(Array.from({ length: 25 }, (_, i) => `book-${i}`))).length, 20);
assert.equal(cartTotals([]), null);
assert.equal(cartTotals([{ price_inr: -1 }]), null);
assert.equal(cartTotals([{ price_inr: 2147483647 }, { price_inr: 1 }]), null);

const { publicBook, visibleBook } = load("components/book-data.ts");
const record = { slug: "real-book", title: "Actual title", price_inr: 150000, active: true,
  file_url: "private/never-expose.pdf", release_approved: true, scan_status: "clean", third_party: false, isbn: "9780000000000", author_slug: "actual-author" };
const book = publicBook(record);
assert.equal(book.saleable, true);
assert.equal("file_url" in book, false);
assert.equal("scan_status" in book, false);
assert.equal(book.isbn, record.isbn);
assert.equal(book.author_slug, record.author_slug);
assert.equal(publicBook({ ...record, release_approved: false }).saleable, false);
assert.equal(publicBook({ ...record, third_party: true, rights_approved: false }).saleable, false);
assert.equal(visibleBook({ ...record, price_inr: 0, release_approved: false }), true);
assert.equal(visibleBook({ ...record, third_party: true, rights_approved: false }), false);
assert.equal(publicBook({ ...record, facts: { Subject: "Research methodology", Language: "English" } }).subject, "Research methodology");
const onSale = publicBook({ ...record, sale_price_inr: 120000 });
assert.equal(onSale.price, 120000);
assert.equal(onSale.regular, 150000);
assert.equal(onSale.onSale, true);
assert.equal(publicBook({ ...record, release_date: "2999-01-01" }).comingSoon, true);
assert.equal(publicBook({ ...record, release_date: "2000-01-01" }).comingSoon, false);
assert.doesNotThrow(() => [record].map((book) => publicBook(book)));
assert.equal(publicBook(record, new Date("2026-10-15T00:00:00Z")).comingSoon, false);
const pendingBook = publicBook({ ...record, price_inr: 0, release_approved: false });
assert.equal(pendingBook.saveable, true);
assert.equal(pendingBook.saleable, false);
const PriceView = load("components/Price.tsx").default;
const saleBook = publicBook({ ...record, price_inr: 29900, sale_price_inr: 25200 });
const priceHtml = renderToStaticMarkup(React.createElement(PriceView, { book: saleBook }));
assert.match(priceHtml, /<s[^>]*>₹299<\/s>/);
assert.match(priceHtml, /₹252/);
assert.match(priceHtml, /₹47 off/);
assert.equal(renderToStaticMarkup(React.createElement(PriceView, { book: { ...saleBook, saleable: false, comingSoon: false } })), "");
assert.match(renderToStaticMarkup(React.createElement(PriceView, { book: { ...saleBook, saleable: false, comingSoon: true } })), /Coming soon/);
{
  const Failed = load("app/(store)/checkout/CheckoutForm.tsx", { "@/components/usePricing": { useCoupon: () => ["", () => {}], usePricing: () => ({ pricing: null, loading: false, failed: true, setPricing() {} }) } }).default;
  const failedHtml = renderToStaticMarkup(React.createElement(Failed, { books: [book], enabled: true, initialSlug: book.slug }));
  assert.match(failedHtml, /Prices could not be loaded/, "a failed price check says so instead of waiting forever");
}
{
  const { rupees } = load("lib/money.ts");
  assert.equal(rupees(16915), "₹169.15", "paise from percent offers are shown, so the shown total is the charged total");
  assert.equal(rupees(25200), "₹252");
}
const CardView = load("components/BookCard.tsx", {
  "./CartProvider": { useCart: () => cart }, "motion/react": { ...require("motion/react"), useReducedMotion: () => true },
}).default;
const cardHtml = renderToStaticMarkup(React.createElement(CardView, { book: saleBook, enabled: true }));
assert.match(cardHtml, /data-book-card/);
assert.match(cardHtml, /Add to bag/);
assert.match(cardHtml, /href="\/books\/real-book"/);
assert.doesNotMatch(cardHtml, /private\/never-expose/);
const dataCover = renderToStaticMarkup(React.createElement(CardView, { book: { ...saleBook, cover: "data:image/svg+xml;utf8,%3Csvg%3E" }, enabled: true }));
assert.match(dataCover, /src="data:image\/svg\+xml/);
assert.match(cardHtml, /Quick view/);
const realCoverHtml = renderToStaticMarkup(React.createElement(CardView, { book: { ...saleBook, cover: "/assets/book1.png" }, enabled: true }));
assert.match(realCoverHtml, /class="book3d"/, "real covers get the tilt without drawn edges");
assert.match(renderToStaticMarkup(React.createElement(CardView, { book: { ...saleBook, offers: ["Buy 2 get 1"] }, enabled: true })), /card-flag[^>]*>Buy 2 get 1</, "a live offer becomes the card flag");
{
  const { CouponBox } = load("components/PricingSummary.tsx");
  assert.match(renderToStaticMarkup(React.createElement(CouponBox, { coupon: "NOPE", setCoupon() {}, result: { code: "NOPE", ok: false, message: "This code is not valid." } })), /This code is not valid\./);
}
assert.match(dataCover, /class="book3d flat"/, "flat demo covers get the drawn spine");
const EntryView = load("components/CatalogueEntry.tsx", {
  "./CartProvider": { useCart: () => cart }, "motion/react": { ...require("motion/react"), useReducedMotion: () => true },
  "next/navigation": { useRouter: () => ({ push() {} }) },
}).default;
const entryHtml = renderToStaticMarkup(React.createElement(EntryView, { book: saleBook, index: 1, enabled: true }));
assert.match(entryHtml, /Catalogue no\. 001/);
assert.match(entryHtml, /Buy now/);
assert.doesNotMatch(entryHtml, /<p[^>]*>[^<]{121,}<\/p>/, "entries carry no long paragraphs");
const QuickViewView = load("components/QuickView.tsx", { "./CartProvider": { useCart: () => cart }, "motion/react": { ...require("motion/react"), useReducedMotion: () => true } }).default;
const qv = renderToStaticMarkup(React.createElement(QuickViewView, { book: { ...saleBook, description: "x".repeat(600) }, enabled: true }));
assert.match(qv, /<dialog/);
assert.match(qv, /View full details/);
assert.match(qv, /x{397}…/, "description is truncated with an ellipsis");
assert.doesNotMatch(qv, /x{398}/);
const { pushRecent } = load("components/RecentlyViewed.tsx", { "motion/react": { ...require("motion/react"), useReducedMotion: () => true } });
assert.deepEqual(pushRecent(["a", "b", "c"], "b"), ["b", "a", "c"]);
assert.equal(pushRecent(Array.from({ length: 12 }, (_, i) => `s${i}`), "new").length, 12);
assert.equal(pushRecent(Array.from({ length: 12 }, (_, i) => `s${i}`), "new")[0], "new");

// Author names and book text are author-supplied; inline JSON-LD must never close its <script>.
const { jsonLdHtml, bookJsonLd } = load("lib/catalogue.ts", { "./access-policy": load("lib/access-policy.ts"), "./store": { siteUrl: () => "https://store.example" } });
const hostile = { name: "</script><script>alert(1)</script> & <!-- \u2028\u2029" };
assert.doesNotMatch(jsonLdHtml(hostile), /[<>&\u2028\u2029]/);
assert.deepEqual(JSON.parse(jsonLdHtml(hostile)), hostile);
assert.equal("offers" in bookJsonLd({ ...record, cover: "/assets/c.png" }, "https://store.example/books/real-book", false), false);
assert.equal(bookJsonLd({ ...record, cover: "/assets/c.png" }, "u", true).offers.price, "1500.00");
assert.equal(bookJsonLd({ ...record, cover: "/assets/c.png" }, "u", true).image, "https://store.example/assets/c.png");
const ld = bookJsonLd({ ...record, cover: "/assets/c.png", price_inr: 29900, sale_price_inr: 25200, sale_ends_at: "2026-10-20T00:00:00+05:30" }, "u", true, new Date("2026-10-15T00:00:00Z"));
assert.equal(ld.offers.price, "252.00");
assert.equal(ld.offers.priceValidUntil, "2026-10-19");
assert.equal(bookJsonLd({ ...record, price_inr: 29900, sale_price_inr: 25200, sale_ends_at: "2026-10-01T00:00:00Z" }, "u", true, new Date("2026-10-15T00:00:00Z")).offers.price, "299.00");
assert.equal(publicBook({ ...record, third_party: true, release_approved: false }).saveable, false);

const CheckoutForm = load("app/(store)/checkout/CheckoutForm.tsx").default;
const { checkoutError } = load("app/(store)/checkout/CheckoutForm.tsx");
for (const raw of ["Purchased file storage is not configured.", "Development order unavailable.",
  "Could not start checkout. Please try again with the same idempotency key.", "Payment setup could not be completed.",
  "Unexpected provider secret", "__proto__", null, {}]) {
  assert.equal(checkoutError(503, raw).message, "Online ordering is currently unavailable. Please try again later.");
}
assert.equal(checkoutError(400, "Please enter your full name.").field, "name");
assert.equal(checkoutError(400, "Enter a valid email address.").field, "email");
assert.equal(checkoutError(400, "That is not a valid mobile number.").field, "phone");
assert.match(checkoutError(429, "rate_limit").message, /wait/);
assert.match(checkoutError(409, "A selected book is not available for sale.").message, /review your selection/);
assert.doesNotMatch(checkoutError(403, "Invalid origin.").message, /origin/);
const render = (props) => renderToStaticMarkup(React.createElement(CheckoutForm, { books: [book], ...props }));
assert.match(render({ enabled: true }), /Your bag is empty/);
cart = { ...cart, slugs: [book.slug] };
const gated = render({ enabled: false });
assert.match(gated, /Online ordering is currently unavailable/);
assert.doesNotMatch(gated, /Purchases are.*paused/);
assert.match(gated, /<button[^>]+disabled=""[^>]*>.*Payment unavailable/);
assert.doesNotMatch(gated, /private\/never-expose/);
assert.match(render({ enabled: true }), /Checking prices/);
assert.match(render({ enabled: true, books: [{ ...book, saleable: false }] }), /Payment unavailable/);
cart = { ...cart, slugs: [] };
assert.match(render({ enabled: true, initialSlug: book.slug }), /Checking prices/);
assert.match(render({ enabled: true, initialSlug: "missing-title" }), /Payment unavailable/);
assert.match(render({ enabled: true, initialSlug: book.slug, books: [pendingBook] }), /href="\/books\/real-book">View add-on details/);

let loginState = "sent";
const Login = load("app/(store)/login/LoginForm.tsx", { react: { ...React, useState: () => [loginState, value => { loginState = value; }] } }).default;
const login = Login({ next: "/library" });
assert.equal(login.props.children[1].props.disabled, true);
login.props.children[0].props.children[1].props.onChange();
assert.equal(Login({ next: "/library" }).props.children[1].props.disabled, false);

async function checkPausedSelection() {
  const AddToCart = load("components/AddToCart.tsx", {
    "./CartProvider": { useCart: () => cart },
    "motion/react": { ...require("motion/react"), useReducedMotion: () => true },
  }).default;
  cart = { ...cart, slugs: [], add: (slug) => { cart.slugs = parseCart(JSON.stringify([...cart.slugs, slug])); } };
  const props = { slug: pendingBook.slug, title: pendingBook.title, enabled: false, saleable: pendingBook.saleable, saveable: pendingBook.saveable };
  const button = AddToCart(props).props.children[0];
  assert.equal(button.props.disabled, false);
  assert.equal(button.props["aria-label"], `Save to bag: ${pendingBook.title}`);
  button.props.onClick();
  assert.deepEqual(cart.slugs, [pendingBook.slug]);
  assert.match(renderToStaticMarkup(React.createElement(AddToCart, props)), /In your bag/);
  const CartContents = load("app/(store)/cart/CartContents.tsx").default;
  const selected = renderToStaticMarkup(React.createElement(CartContents, { books: [pendingBook], enabled: false }));
  assert.match(selected, /Actual title/);
  assert.match(selected, /Saved for later/);
  assert.match(selected, /Online ordering is currently unavailable/);
  assert.match(selected, /Not yet on sale/);
  const unapprovedPrice = renderToStaticMarkup(React.createElement(CartContents, { books: [{ ...pendingBook, price_inr: 100 }], enabled: false }));
  assert.doesNotMatch(unapprovedPrice, /₹/);
  assert.match(selected, /<button[^>]+disabled=""[^>]*>Checkout unavailable/);
  assert.doesNotMatch(selected, /₹0|Remove unavailable titles|no longer available/);
  assert.match(render({ enabled: false, books: [pendingBook] }), /Payment unavailable/);
  assert.match(render({ enabled: false, books: [pendingBook] }), /Not yet on sale/);
  assert.doesNotMatch(render({ enabled: false, books: [{ ...pendingBook, price_inr: 100 }] }), /₹/);
  const priced = publicBook({ ...record, price_inr: 29900, sale_price_inr: 25200 });
  const bag = renderToStaticMarkup(React.createElement(CartContents, { books: [priced], enabled: true }));
  assert.match(bag, /₹252/);
  assert.match(bag, /<s[^>]*>₹299<\/s>/);
  const pricing = { lines: [], applied: [{ id: "o1", name: "Ayurveda buy 2 get 1", code: null, saving: 25200 }], subtotal: 50400, discount: 25200, total: 25200, coupon: null };
  const PricedCart = load("app/(store)/cart/CartContents.tsx", { "@/components/usePricing": { useCoupon: () => ["", () => {}], usePricing: () => ({ pricing, loading: false, failed: false, setPricing() {} }) } }).default;
  const offerBag = renderToStaticMarkup(React.createElement(PricedCart, { books: [priced], enabled: true }));
  assert.match(offerBag, /Ayurveda buy 2 get 1/); assert.match(offerBag, /−₹252/); assert.match(offerBag, /You save ₹252/);
  assert.match(renderToStaticMarkup(React.createElement(CheckoutForm, { books: [priced], enabled: true, initialSlug: priced.slug })), /₹252/);
  cart.slugs = [];
  assert.equal(AddToCart({ ...props, enabled: true }).props.children[0].props.disabled, true);
  assert.equal(AddToCart({ ...props, enabled: true }).props.children[0].props["aria-label"], `Unavailable: ${pendingBook.title}`);
  assert.equal(AddToCart({ ...props, saveable: false }).props.children[0].props.disabled, true);
  const CartPage = load("app/(store)/cart/page.tsx", { "@/lib/db": { getBooks: async () => [
    { ...record, price_inr: 0, release_approved: false },
    { ...record, slug: "unapproved-third-party", third_party: true, release_approved: false },
  ] }, "@/components/book-data": load("components/book-data.ts"),
    "./CartContents": { default: ({ books }) => React.createElement("div", {}, books.map((book) => book.slug).join(",")) } }).default;
  const page = renderToStaticMarkup(await CartPage());
  assert.match(page, /real-book/);
  assert.doesNotMatch(page, /unapproved-third-party/);
}

async function checkRetries() {
  const originals = { fetch: global.fetch, window: global.window, sessionStorage: global.sessionStorage };
  const store = new Map();
  const requests = [];
  const redirects = [];
  let customer = { name: "Test Reader", email: "reader@example.com", phone: "9876543210" };
  let refIndex = 0;
  const refs = [];
  let quoted = { lines: [], applied: [], subtotal: 15900, discount: 0, total: 15900, coupon: null };
  const repriced = [];
  const Form = load("app/(store)/checkout/CheckoutForm.tsx", {
    react: { ...React, useState: (value) => [value && typeof value === "object" && "name" in value ? customer : value, () => {}],
      useRef: (value) => refs[refIndex++] ||= { current: value } },
    "@/components/usePricing": { useCoupon: () => ["SAVE10", () => {}], usePricing: () => ({ pricing: quoted, loading: false, failed: false, setPricing: (p) => repriced.push(p) }) },
  }).default;
  global.sessionStorage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  global.window = { location: { assign: (value) => redirects.push(value) } };
  global.fetch = async (_url, options) => {
    requests.push(options);
    if (requests.length === 1) throw new Error("Simulated ambiguous network failure");
    return { ok: true, status: 202, json: async () => ({ pending: true }) };
  };
  cart = { ...cart, slugs: [book.slug] };
  const submit = async (props = {}) => {
    refIndex = 0;
    const tree = Form({ books: [book], enabled: true, ...props });
    const form = tree.props.children.props.children[0];
    await form.props.onSubmit({ preventDefault() {} });
  };
  try {
    await submit(); await submit();
    const first = JSON.parse(requests[0].body), second = JSON.parse(requests[1].body);
    assert.equal(first.expectedTotal, 15900, "checkout sends the total the customer saw");
    assert.equal(first.coupon, "SAVE10");
    assert.equal(first.idempotencyKey, second.idempotencyKey);
    assert.equal(requests[0].headers["idempotency-key"], first.idempotencyKey);
    assert.deepEqual(first.slugs, [book.slug]);
    assert.equal("slug" in first, false);
    assert.equal(redirects.length, 0, "pending checkout must not redirect");
    assert.ok(![...store.values()].join().includes(customer.email), "storage must not contain customer details");
    customer = { ...customer, phone: "9876543211" };
    await submit();
    assert.notEqual(JSON.parse(requests[2].body).idempotencyKey, first.idempotencyKey);
    await submit({ initialSlug: book.slug });
    const legacy = JSON.parse(requests[3].body);
    assert.equal(legacy.slug, book.slug);
    assert.equal("slugs" in legacy, false);
    await submit({ enabled: false });
    assert.equal(requests.length, 4, "paused payments must never send a request");
    await submit({ enabled: false, books: [pendingBook] });
    await submit({ enabled: true, books: [pendingBook] });
    assert.equal(requests.length, 4, "saving a pending edition must never make it purchasable");
    const before = requests.length;
    global.fetch = async (_url, options) => { requests.push(options); return { ok: true, status: 202, json: async () => ({ pending: true }) }; };
    await submit();
    quoted = { ...quoted, total: 14000 };
    await submit();
    assert.notEqual(JSON.parse(requests[before + 1].body).idempotencyKey, JSON.parse(requests[before].body).idempotencyKey, "a new total starts a new checkout, never the old payment link");
    const changed = { ...quoted, total: 9900 };
    global.fetch = async (_url, options) => { requests.push(options); return { ok: false, status: 409, json: async () => ({ error: "Prices changed.", pricing: changed }) }; };
    await submit();
    assert.deepEqual(repriced, [changed], "a changed price is shown again before paying");
    assert.equal(redirects.length, 0);
  } finally { Object.assign(global, originals); }
}

async function checkCatalogue() {
  const listing = load("lib/listing.ts");
  const Search = load("app/(store)/search/page.tsx", {
    "@/lib/store-data": { getStoreBooks: async () => [publicBook({ ...record, file_format: "PDF", language: "English" }), publicBook({ ...record, slug: "second-book", title: "Second title", isbn: "9781111111111", file_format: "EPUB" })],
      getCategories: async () => [], bestsellerSlugs: async () => [] },
    "@/lib/listing": listing,
    "@/components/Listing": load("components/Listing.tsx", { "./BookCard": { default: ({ book }) => React.createElement("article", { "data-book": book.slug }, book.title) }, "@/lib/listing": listing }),
  }).default;
  const render = async (query) => renderToStaticMarkup(await Search({ searchParams: Promise.resolve(query) }));
  const isbn = await render({ q: record.isbn });
  assert.match(isbn, /data-book="real-book"/);
  assert.doesNotMatch(isbn, /data-book="second-book"/);
  assert.match(await render({ format: "EPUB" }), /Remove filter EPUB/);
  assert.match(await render({ q: record.isbn, format: "EPUB" }), /No add-ons match these filters/);
}

async function checkHomepage() {
  const content = load("lib/content.ts", { "./db": { sql() { throw new Error("Database access forbidden in UI tests"); } } });
  const helpers = load("components/content-data.ts", { "@/lib/content": content });
  assert.equal(helpers.contentUrl("javascript:alert(1)"), null);
  assert.equal(helpers.videoUrl("https://assets.example.com/interview.mp4"), "https://assets.example.com/interview.mp4");
  for (const value of ["http://assets.example.com/interview.mp4", "https://127.0.0.1/interview.mp4", "https://localhost/interview.mp4", "https://files.internal/interview.mp4", "https://assets.example.com/page", "/assets/video.mp4"]) assert.equal(helpers.videoUrl(value), null);
  const { copyViolations } = load("lib/copy.ts");
  assert.deepEqual(copyViolations("<h2>Five words fit right here</h2><p>Short line.</p>"), []);
  assert.equal(copyViolations("<h2>One two three four five six seven</h2>").length, 1);
  assert.equal(copyViolations(`<p>${"x".repeat(121)}</p>`).length, 1);
  const motionStub = { "motion/react": { ...require("motion/react"), useReducedMotion: () => true } };
  const Hero = load("components/home/HeroCampaign.tsx", motionStub);
  assert.deepEqual(Hero.splitAccent("Tally add-ons, delivered instantly"), ["Tally add-ons, ", "delivered instantly"]);
  const heroCovers = [{ slug: "real-book", title: "Actual title", cover: "/assets/book1.png" }];
  const none = renderToStaticMarkup(React.createElement(Hero.default, { banners: [], covers: heroCovers }));
  assert.match(none, /delivered instantly/, "no banners shows the default slide");
  assert.doesNotMatch(none, /Next slide|Pause slides/);
  const banner = (id) => ({ id, title: `Offer ${id}`, body: null, subtitle: null, image: null, mobileImage: null, href: "/search", label: null, theme: "forest" });
  const one = renderToStaticMarkup(React.createElement(Hero.default, { banners: [banner("a")], covers: heroCovers }));
  assert.match(one, /Offer a/);
  assert.doesNotMatch(one, /Next slide|Pause slides/, "a single banner has no controls");
  const two = renderToStaticMarkup(React.createElement(Hero.default, { banners: [banner("a"), banner("b")], covers: heroCovers }));
  assert.match(two, /Next slide/);
  assert.doesNotMatch(two, /Pause slides/, "reduced motion never autoplays, so no pause control");
  const homeBook = { ...saleBook, highlights: ["Method as the subject, not an appendix"] };
  const sections = [
    React.createElement(Hero.default, { banners: [], covers: heroCovers }),
    React.createElement(load("components/home/CategoryTiles.tsx").default, { tiles: [{ slug: "science", name: "Science", count: 3, covers: ["/assets/book1.png"] }] }),
    React.createElement(load("components/home/Featured.tsx", { ...motionStub, "next/navigation": { useRouter: () => ({ push() {} }) } }).default, { books: [homeBook], rails: [], enabled: true }),
    React.createElement(load("components/home/LookInside.tsx").default, { books: [homeBook] }),
    React.createElement(load("components/home/PublishBand.tsx", motionStub).default, { covers: heroCovers }),
    React.createElement(load("components/home/FaqGrid.tsx").default),
  ].map((el) => renderToStaticMarkup(el)).join("");
  assert.deepEqual(copyViolations(sections), [], "homepage copy stays short");
  {
    const Featured = load("components/home/Featured.tsx", { ...motionStub, "next/navigation": { useRouter: () => ({ push() {} }) } }).default;
    const shelf = Array.from({ length: 6 }, (_, i) => ({ ...homeBook, slug: `b${i}` }));
    const rows = renderToStaticMarkup(React.createElement(Featured, { books: shelf, enabled: true, rails: [
      { key: "bestsellers", title: "Bestsellers", tagline: "", href: "/search", books: shelf.slice(0, 1) },
      { key: "new", title: "New arrivals", tagline: "", href: "/search", books: shelf.slice(0, 5) }] }));
    assert.match(rows, /New arrivals/); assert.doesNotMatch(rows, /Bestsellers/, "a row of one or two books is hidden, not shown half-empty");
  }
  assert.doesNotMatch(sections, /akshara|अ/);
  const sitemap = load("app/sitemap.ts", { "@/lib/db": { getBooks: async () => [record, { ...record, slug: "unapproved", third_party: true, release_approved: false }] },
    "@/components/book-data": load("components/book-data.ts"), "@/lib/store-data": { getCategories: async () => [{ slug: "science" }] } }).default;
  const urls = (await sitemap()).map(item => item.url).join("\n");
  assert.match(urls, /books\/real-book/);
  assert.doesNotMatch(urls, /books\/unapproved/);
  assert.match(urls, /category\/science/);
  const Header = load("components/StoreHeader.tsx", { "next/navigation": { usePathname: () => "/", useRouter: () => ({ push() {} }) } }).default;
  const previews = { fiction: [{ slug: "real-book", title: "Actual title", cover: "/assets/book1.png" }] };
  const header = renderToStaticMarkup(React.createElement(Header, { name: "Tallywebsolutions", nav, previews,
    announcement: { title: "Festive reads: up to 20% off", link_url: "/search?offer=1" } }));
  assert.match(header, /Festive reads: up to 20% off/);
  assert.match(header, /href="\/category\/fiction"/);
  assert.match(header, /href="\/category\/crime"/);
  assert.match(header, /<form[^>]+action="\/search"/);
  assert.match(header, /id="bag-target"/);
  assert.match(header, /Cover of Actual title/, "category panels preview real covers");
  assert.doesNotMatch(header, /अ|logo-mark/, "no Akshara mark");
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Header, { name: "x", nav, announcement: null, previews: {} })), /announcement-bar/);
  const Shell = load("components/AdminShell.tsx").default;
  const shell = renderToStaticMarkup(React.createElement(Shell, { active: "orders", title: "Orders" }, "body"));
  for (const href of ["/admin/orders", "/admin/categories", "/admin/platform/collections", "/admin/banners", "/admin/platform/delivery"])
    assert.ok(shell.includes(`href="${href.replace("&", "&amp;")}"`), href);
  assert.match(shell, /aria-current="page"[^>]*>[^<]*Orders/);
}

Promise.resolve().then(checkPausedSelection).then(checkRetries).then(checkCatalogue).then(checkHomepage).then(() => console.log("Reading room checks passed: paused selection, cart, checkout, catalogue, video validation, banners, header, admin shell."))
  .catch((error) => { console.error(error); process.exitCode = 1; });
