-- Marketplace: categories, per-title offers, release dates, wishlist, scheduled module end.
-- Additive and idempotent: re-applied on every migrate run.
create table if not exists categories (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 1 and 80),
  parent_slug text references categories(slug),
  image_url text,
  colour text check (colour is null or colour ~ '^#[0-9a-fA-F]{6}$'),
  sort integer not null default 0,
  status text not null default 'published' check (status in ('draft','published','archived')),
  updated_at timestamptz not null default now()
);
alter table books add column if not exists category_slug text references categories(slug);
alter table books add column if not exists sale_price_inr integer;
alter table books add column if not exists sale_starts_at timestamptz;
alter table books add column if not exists sale_ends_at timestamptz;
alter table books add column if not exists release_date date;
do $$ begin
  alter table books drop constraint if exists books_sale_price_check;
  alter table books add constraint books_sale_price_check check (
    sale_price_inr is null or (sale_price_inr > 0 and sale_price_inr < price_inr));
  alter table books drop constraint if exists books_sale_window_check;
  alter table books add constraint books_sale_window_check check (
    sale_starts_at is null or sale_ends_at is null or sale_starts_at < sale_ends_at);
end $$;
create index if not exists books_category_idx on books(category_slug);

-- Existing free-text subjects become categories; nothing is dropped.
insert into categories(slug, name)
select distinct trim(both '-' from regexp_replace(lower(subject), '[^a-z0-9]+', '-', 'g')), subject
from books where subject is not null and trim(subject) <> ''
on conflict (slug) do nothing;
update books set category_slug = trim(both '-' from regexp_replace(lower(subject), '[^a-z0-9]+', '-', 'g'))
where category_slug is null and subject is not null and trim(subject) <> '';

create table if not exists wishlist (
  reader_id text not null,
  book_slug text not null references books(slug),
  created_at timestamptz not null default now(),
  primary key (reader_id, book_slug)
);

alter table content_modules add column if not exists ends_at timestamptz;
do $$ begin
  alter table content_modules drop constraint if exists content_modules_type_check;
  alter table content_modules add constraint content_modules_type_check check (type in
    ('hero','banner','text','collection','testimonial','author','media','announcement','promo','genre-switcher'));
end $$;
