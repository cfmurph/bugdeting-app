import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { accounts, linkedItems, transactions } from '../db/schema';
import type { ParsedCsvRow } from '../utils/csvTransactionImport';
import { CategorizationService } from './CategorizationService';

export type ManualTransactionInput = {
  type: 'income' | 'expense';
  amount: number;
  description: string;
  date: string;
};

export class TransactionService {
  private categorization: CategorizationService;

  constructor(private db: BetterSQLite3Database<typeof schema>) {
    this.categorization = new CategorizationService(db);
  }

  private getManualAccountId(userId: number, db: BetterSQLite3Database<typeof schema> = this.db): number {
    const manualItemId = `manual-local-${userId}`;
    const [item] = db.select().from(linkedItems).where(eq(linkedItems.plaidItemId, manualItemId)).limit(1).all();
    if (!item) {
      throw new Error('Default manual linked item missing; run seed');
    }
    const [acct] = db
      .select()
      .from(accounts)
      .where(eq(accounts.linkedItemId, item.id))
      .limit(1)
      .all();
    if (!acct) {
      throw new Error('Manual account missing');
    }
    return acct.id;
  }

  addManualTransaction(userId: number, input: ManualTransactionInput): void {
    const accountId = this.getManualAccountId(userId);
    const amountAbs = Math.round(Number(input.amount) * 100);
    const amountCents = input.type === 'expense' ? Math.abs(amountAbs) : -Math.abs(amountAbs);
    const dedupeKey = `manual:${userId}:${randomUUID()}`;
    const catId = this.categorization.resolveCategoryId(userId, null, input.description, null, null);

    this.db
      .insert(transactions)
      .values({
        accountId,
        dedupeKey,
        providerTransactionId: dedupeKey,
        amountCents,
        isoCurrencyCode: 'CAD',
        date: input.date.slice(0, 10),
        name: input.description,
        merchantName: null,
        pending: false,
        providerCategoryPrimary: null,
        providerCategoryDetail: null,
        userCategoryId: catId,
        isTransfer: false,
        source: 'manual',
      })
      .run();
  }

  /** Legacy shape for tests / simple clients */
  addTransactionLegacy(userId: number, type: 'income' | 'expense', amount: number, description: string, date: Date | string): void {
    const d = typeof date === 'string' ? date : date.toISOString().slice(0, 10);
    this.addManualTransaction(userId, { type, amount, description, date: d });
  }

  /** Inserts validated CSV rows in one DB transaction; applies category rules like manual entry. */
  importCsvRows(userId: number, rows: ParsedCsvRow[]): number {
    if (rows.length === 0) {
      return 0;
    }
    return this.db.transaction((tx) => {
      const accountId = this.getManualAccountId(userId, tx);
      let imported = 0;
      for (const row of rows) {
        const amountAbs = Math.round(row.amountDollars * 100);
        const amountCents = row.type === 'expense' ? Math.abs(amountAbs) : -Math.abs(amountAbs);
        const dedupeKey = `csv-import:${userId}:${row.line}:${randomUUID()}`;
        const catId = this.categorization.resolveCategoryId(userId, null, row.description, null, null);
        tx.insert(transactions)
          .values({
            accountId,
            dedupeKey,
            providerTransactionId: dedupeKey,
            amountCents,
            isoCurrencyCode: 'CAD',
            date: row.date,
            name: row.description,
            merchantName: null,
            pending: false,
            providerCategoryPrimary: null,
            providerCategoryDetail: null,
            userCategoryId: catId,
            isTransfer: false,
            source: 'csv_import',
          })
          .run();
        imported += 1;
      }
      return imported;
    });
  }

  listForUser(userId: number, limit = 500) {
    return this.db
      .select({
        id: transactions.id,
        amountCents: transactions.amountCents,
        isoCurrencyCode: transactions.isoCurrencyCode,
        date: transactions.date,
        name: transactions.name,
        merchantName: transactions.merchantName,
        pending: transactions.pending,
        userCategoryId: transactions.userCategoryId,
        isTransfer: transactions.isTransfer,
        source: transactions.source,
        providerCategoryPrimary: transactions.providerCategoryPrimary,
        providerCategoryDetail: transactions.providerCategoryDetail,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(linkedItems, eq(accounts.linkedItemId, linkedItems.id))
      .where(eq(linkedItems.userId, userId))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit)
      .all();
  }
}
