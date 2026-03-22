import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { getDb } from './client';

export function runMigrations(): void {
  const db = getDb();
  const folder = path.join(process.cwd(), 'drizzle');
  migrate(db, { migrationsFolder: folder });
}
