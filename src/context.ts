import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { PlaidApi } from 'plaid';
import * as schema from './db/schema';
import { getDb, initDb, resetDbSingleton } from './db/client';
import { runMigrations } from './db/migrate';
import { getDefaultUserId, seedDefaultUser } from './db/seed';
import { createPlaidClient } from './integrations/plaidClient';
import { BudgetService } from './services/BudgetService';
import { CategorizationService } from './services/CategorizationService';
import { ProjectionService } from './services/ProjectionService';
import { SyncService } from './services/SyncService';
import { TransactionService } from './services/TransactionService';

export type AppContext = {
  db: BetterSQLite3Database<typeof schema>;
  defaultUserId: number;
  plaid: PlaidApi | null;
  syncService: SyncService | null;
  transactionService: TransactionService;
  budgetService: BudgetService;
  projectionService: ProjectionService;
  categorizationService: CategorizationService;
};

let context: AppContext | null = null;

export function resetContextForTests(): void {
  context = null;
  resetDbSingleton();
}

export function bootstrapApp(databasePath?: string): AppContext {
  if (context) {
    return context;
  }
  if (databasePath) {
    initDb(databasePath);
  } else {
    initDb();
  }
  runMigrations();
  const db = getDb();
  seedDefaultUser(db);
  const defaultUserId = getDefaultUserId(db);

  let plaid: PlaidApi | null = null;
  try {
    plaid = createPlaidClient();
  } catch {
    plaid = null;
  }
  const syncService = plaid ? new SyncService(db, plaid) : null;

  context = {
    db,
    defaultUserId,
    plaid,
    syncService,
    transactionService: new TransactionService(db),
    budgetService: new BudgetService(db),
    projectionService: new ProjectionService(db),
    categorizationService: new CategorizationService(db),
  };
  return context;
}

export function getContext(): AppContext {
  if (!context) {
    return bootstrapApp();
  }
  return context;
}

/** @internal test helper */
export function setContextForTests(c: AppContext): void {
  context = c;
}
