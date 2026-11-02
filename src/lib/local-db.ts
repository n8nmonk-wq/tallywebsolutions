import { PGlite } from '@electric-sql/pglite';

const shared = globalThis as typeof globalThis & { readingRoomDatabase?: PGlite };
export function localDatabase() {
  if (process.env.NODE_ENV === 'production' || !process.env.PGLITE_DATABASE_DIR) {
    throw new Error('Isolated database is available only in explicit local development mode.');
  }
  return shared.readingRoomDatabase ??= new PGlite(process.env.PGLITE_DATABASE_DIR);
}
