// Temporary connection check. Delete this file after use.
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const { rows } = await client.query('select current_database() as name');
  console.log('CONNECTED to database:', rows[0].name);
} catch (error) {
  console.log('FAILED:', error.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
