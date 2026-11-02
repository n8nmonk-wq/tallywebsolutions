-- Offers engine: admin offers, paid-order redemptions, and the discount on each order.
-- Additive and idempotent. Plain statements only (no $$ blocks): admin setup applies it statement by statement.
create table if not exists offers (
  id text primary key,
  name text not null check (length(name) between 1 and 120),
  kind text not null check (kind in ('percent','flat','bxgy','bundle')),
  scope text not null default 'all' check (scope in ('all','books','collection','category','order')),
  targets jsonb not null default '[]'::jsonb check (jsonb_typeof(targets) = 'array'),
  value integer not null default 0 check (value >= 0),
  cap integer check (cap is null or cap > 0),
  buy_qty integer check (buy_qty is null or buy_qty between 1 and 20),
  get_qty integer check (get_qty is null or get_qty between 1 and 20),
  get_percent integer check (get_percent is null or get_percent between 1 and 100),
  bundle_qty integer check (bundle_qty is null or bundle_qty between 2 and 20),
  bundle_price integer check (bundle_price is null or bundle_price > 0),
  min_items integer not null default 0 check (min_items between 0 and 20),
  min_subtotal integer not null default 0 check (min_subtotal >= 0),
  code text unique check (code is null or code ~ '^[A-Z0-9-]{3,32}$'),
  combinable boolean not null default false,
  first_order_only boolean not null default false,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  priority integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);
create index if not exists offers_status_idx on offers (status, ends_at);
create table if not exists offer_redemptions (
  offer_id text not null references offers(id),
  order_id text not null references orders(id),
  email text not null,
  discount integer not null check (discount >= 0),
  created_at timestamptz not null default now(),
  primary key (offer_id, order_id)
);
create index if not exists offer_redemptions_email_idx on offer_redemptions (email);
alter table orders add column if not exists discount integer not null default 0;
alter table orders add column if not exists offers jsonb not null default '[]'::jsonb;
