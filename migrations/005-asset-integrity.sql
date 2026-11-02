-- Legacy hashes remain unset until the approved asset bytes are verified.
begin;
alter table books add column if not exists file_sha256 text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'books'::regclass and conname = 'books_file_sha256_check'
  ) then
    alter table books add constraint books_file_sha256_check
      check (file_sha256 is null or (length(file_sha256) = 64 and file_sha256 ~* '^[a-f0-9]{64}$'));
  end if;
end $$;
commit;
