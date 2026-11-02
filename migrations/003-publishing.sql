-- Review locally before applying. No title receives implicit release approval.
create table if not exists author_profiles (
  id text primary key,
  reader_id text unique,
  name text not null check (length(name) between 1 and 200),
  bio text,
  photo_url text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  publish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists publishing_submissions (
  id text primary key,
  author_id text not null references author_profiles(id),
  title text not null,
  description text not null,
  price_inr integer not null check (price_inr >= 0),
  isbn text,
  status text not null default 'draft' check (status in ('draft','submitted','in_review','changes_requested','approved','rejected','released')),
  review_notes text not null default '',
  ownership_declared boolean not null default false,
  ownership_declared_by text,
  ownership_declared_at timestamptz,
  rights_approved boolean not null default false,
  commercial_approved boolean not null default false,
  book_slug text unique,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table publishing_submissions add column if not exists ownership_declared boolean not null default false;
alter table publishing_submissions add column if not exists ownership_declared_by text;
alter table publishing_submissions add column if not exists ownership_declared_at timestamptz;
create index if not exists publishing_author_idx on publishing_submissions(author_id, updated_at desc);
create table if not exists publishing_assets (
  id text primary key,
  submission_id text not null references publishing_submissions(id) on delete cascade,
  kind text not null check (kind in ('manuscript','cover','sample')),
  blob_url text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  scan_status text not null default 'pending' check (scan_status in ('pending','clean','infected','error')),
  reviewed boolean not null default false,
  scanner_reference text,
  scanned_at timestamptz,
  created_at timestamptz not null default now(),
  unique(submission_id, kind),
  check (kind <> 'cover' or size_bytes <= 5242880)
);
create table if not exists publishing_audit (
  id bigserial primary key,
  submission_id text references publishing_submissions(id),
  actor_id text not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists publishing_upload_tickets (
  id text primary key,
  submission_id text not null references publishing_submissions(id) on delete cascade,
  reader_id text not null,
  kind text not null check (kind in ('manuscript','cover','sample')),
  pathname text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists content_modules (
  id text primary key,
  type text not null check (type in ('hero','banner','text','collection','testimonial','author','media')),
  title text not null,
  body text,
  image_url text,
  mobile_image_url text,
  link_url text,
  link_label text,
  payload jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  publish_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists content_collections (
  slug text primary key,
  title text not null,
  description text,
  image_url text,
  book_slugs jsonb not null default '[]'::jsonb check (jsonb_typeof(book_slugs) = 'array'),
  sort integer not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  publish_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table books add column if not exists third_party boolean not null default false;
alter table books add column if not exists rights_approved boolean not null default false;
alter table books add column if not exists commercial_approved boolean not null default false;
alter table books add column if not exists release_approved boolean not null default false;
alter table books add column if not exists scan_status text not null default 'pending' check (scan_status in ('pending','clean','infected','error'));
alter table books add column if not exists submission_id text unique references publishing_submissions(id);
alter table books add column if not exists sample_url text;
alter table books add column if not exists file_sha256 text;

-- Protect other book editing paths as well as the platform release endpoint.
create or replace function guard_publishing_release() returns trigger language plpgsql as $$
begin
  if new.third_party and new.release_approved then
    if not new.rights_approved or not new.commercial_approved or new.scan_status <> 'clean' or not exists (
      select 1 from publishing_submissions s
      where s.id = new.submission_id and s.status in ('approved','released')
      and s.ownership_declared and s.ownership_declared_by is not null and s.ownership_declared_at is not null
      and s.rights_approved and s.commercial_approved
      and exists (select 1 from publishing_assets a where a.submission_id = s.id and a.kind = 'manuscript' and a.blob_url = new.file_url and a.sha256 = new.file_sha256 and a.scan_status = 'clean' and a.reviewed)
      and exists (select 1 from publishing_assets a where a.submission_id = s.id and a.kind = 'cover' and '/api/submissions/assets/' || a.id = new.cover and a.scan_status = 'clean' and a.reviewed)
      and not exists (select 1 from publishing_assets a where a.submission_id = s.id and (a.scan_status <> 'clean' or not a.reviewed))
      and (new.sample_url is null or exists (select 1 from publishing_assets a where a.submission_id = s.id and a.kind = 'sample' and '/api/submissions/assets/' || a.id = new.sample_url and a.scan_status = 'clean' and a.reviewed))
    ) then raise exception 'Third-party release requires editorial, rights, commercial, and clean reviewed asset approvals'; end if;
  end if;
  return new;
end $$;
drop trigger if exists publishing_release_guard on books;
create trigger publishing_release_guard before insert or update on books for each row execute function guard_publishing_release();
