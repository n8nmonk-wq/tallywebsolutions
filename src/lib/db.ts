import { neon } from "@neondatabase/serverless";
import { requireEnv } from "./env";
import { localDatabase } from './local-db';

/** Constructed lazily: the build collects page data without a database, so a
 *  missing DATABASE_URL must fail on first query, not on import. */
let client: ReturnType<typeof neon> | null = null;

const remote = () => {
  if (!client)
    client = neon(
      requireEnv("DATABASE_URL", "Paste your Neon connection string into .env.local.")
    );
  return client;
};

type LocalQuery = Promise<unknown[]> & { statement: string; parameters: unknown[] };
function localQuery(input: string | TemplateStringsArray, ...values: unknown[]): LocalQuery {
  const statement = typeof input === 'string' ? input : input.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, '');
  const parameters = typeof input === 'string' ? (Array.isArray(values[0]) ? values[0] : []) : values;
  let pending: Promise<unknown[]> | undefined;
  return {
    statement, parameters,
    then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      pending ??= localDatabase().query(statement, parameters).then(result => result.rows);
      return pending.then(resolve, reject);
    },
  } as unknown as LocalQuery;
}

export const sql = new Proxy((...args: unknown[]) => {
  if (process.env.PGLITE_DATABASE_DIR && process.env.NODE_ENV !== 'production') {
    return localQuery(args[0] as string | TemplateStringsArray, ...args.slice(1));
  }
  return (remote() as (...a: unknown[]) => unknown)(...args);
}, {
  get(_, key) {
    if (process.env.PGLITE_DATABASE_DIR && process.env.NODE_ENV !== 'production') {
      if (key === 'query') return localQuery;
      if (key === 'transaction') return async (queries: LocalQuery[] | ((query: typeof localQuery) => LocalQuery[])) => {
        const jobs = typeof queries === 'function' ? queries(localQuery) : queries;
        return localDatabase().transaction(async tx => {
          const results = [];
          for (const job of jobs) results.push((await tx.query(job.statement, job.parameters)).rows);
          return results;
        });
      };
    }
    const value = Reflect.get(remote(), key);
    return typeof value === 'function' ? value.bind(remote()) : value;
  },
}) as ReturnType<typeof neon<false, false>>;

export type Book = {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  long_description: string | null;
  highlights: string[];
  facts: Record<string, string>;
  authorship: string | null;
  cover: string | null;
  price_inr: number;
  file_url: string | null;
  file_format: string | null;
  file_size: string | null;
  isbn: string | null;
  publisher: string | null;
  pages: number | null;
  year: number | null;
  active: boolean;
  subject?: string | null;
  language?: string | null;
  edition?: string | null;
  author_slug?: string | null;
  sample_url?: string | null;
  third_party?: boolean;
  rights_approved?: boolean;
  commercial_approved?: boolean;
  release_approved?: boolean;
  scan_status?: string;
  file_sha256?: string | null;
  category_slug?: string | null;
  sale_price_inr?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  release_date?: string | null;
};

export type OrderItem = { slug: string; title: string; price: number; discount?: number; file_url?: string | null; file_format?: string | null; edition?: string | null; file_sha256?: string | null; list_price?: number };

export type Order = {
  id: string;
  name: string | null;
  email: string;
  discount?: number;
  offers?: { id: string; name: string; code: string | null; saving: number }[];
  phone: string | null;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: "created" | "paid" | "fulfilled" | "payment_failed" | "refunded";
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_link_id: string | null;
  invoice_no: string | null;
  created_at: string;
  paid_at: string | null;
};

export async function getBooks(): Promise<Book[]> {
  return (await sql`
    select * from books where active = true order by sort, title
  `) as Book[];
}

export async function getBook(slug: string): Promise<Book | null> {
  const rows = (await sql`select * from books where slug = ${slug}`) as Book[];
  return rows[0] ?? null;
}

export async function getOrder(id: string): Promise<Order | null> {
  const rows = (await sql`select * from orders where id = ${id}`) as Order[];
  return rows[0] ?? null;
}

export async function logEvent(orderId: string | null, type: string, payload: unknown = {}) {
  await sql`
    insert into events (order_id, type, payload)
    values (${orderId}, ${type}, ${JSON.stringify(payload)}::jsonb)
  `;
}
