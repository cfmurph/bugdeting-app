import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

export function getDatabasePath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./data/budget.db';
  if (url.startsWith('file:')) {
    return url.slice('file:'.length);
  }
  return url;
}

export function initDb(dbPath?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) {
    return _db;
  }
  const resolved = dbPath ?? getDatabasePath();
  const dir = path.dirname(resolved);
  if (dir && dir !== '.' && !resolved.includes(':memory:')) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(resolved);
  sqlite.pragma('foreign_keys = ON');
  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });
  return _db;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!_db) {
    return initDb();
  }
  return _db;
}

export function getSqlite(): Database.Database {
  if (!_sqlite) {
    initDb();
  }
  return _sqlite!;
}

export function resetDbSingleton(): void {
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      /* ignore */
    }
  }
  _db = null;
  _sqlite = null;
}
