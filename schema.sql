-- Tallywebsolutions digital storefront.
-- Run once against the project's own Neon instance.

create table if not exists books (
  slug         text primary key,
  title        text not null,
  subtitle     text,
  description  text,
  cover        text,
  price_inr    integer not null,          -- paise
  file_url     text,                      -- private blob / storage url
  file_format  text default 'TDL',
  file_size    text,
  isbn         text,
  publisher    text,
  pages        integer,
  year         integer,
  sort         integer default 0,
  active       boolean not null default true
);

create table if not exists orders (
  id                  text primary key,   -- unguessable, doubles as receipt url
  email               text not null,
  phone               text,
  items               jsonb not null default '[]'::jsonb,
  subtotal            integer not null,   -- paise
  tax                 integer not null default 0,
  total               integer not null,
  status              text not null default 'created',
                      -- created | paid | fulfilled | payment_failed | refunded
  razorpay_order_id   text unique,
  razorpay_payment_id text unique,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);

create index if not exists orders_email_idx on orders (email);
create index if not exists orders_status_created_idx on orders (status, created_at desc);

create table if not exists downloads (
  order_id   text not null references orders(id) on delete cascade,
  book_slug  text not null,
  count      integer not null default 0,
  last_at    timestamptz,
  primary key (order_id, book_slug)
);

create table if not exists events (
  id         bigserial primary key,
  order_id   text,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_order_idx on events (order_id, created_at desc);

-- ── customer details + richer book copy (added 23 Aug 2026) ──────────────
alter table orders add column if not exists name text;
alter table orders add column if not exists razorpay_link_id text;
alter table orders add column if not exists invoice_no text;

create unique index if not exists orders_link_idx on orders (razorpay_link_id);

alter table books add column if not exists long_description text;
alter table books add column if not exists highlights jsonb default '[]'::jsonb;

-- ── bibliographic facts shown as a catalogue table (31 Aug 2026) ──────────
alter table books add column if not exists facts jsonb default '{}'::jsonb;
alter table books add column if not exists authorship text;
