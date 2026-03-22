import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { accounts, categories, linkedItems, transactions } from '../db/schema';

export class BudgetService {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  getBudgetSummary(
    userId: number,
    range?: { start: string; end: string },
  ): {
    totalIncomeCents: number;
    totalExpensesCents: number;
    balanceCents: number;
    start?: string;
    end?: string;
  } {
    const conds = [eq(linkedItems.userId, userId), eq(transactions.isTransfer, false)];
    if (range) {
      conds.push(gte(transactions.date, range.start));
      conds.push(lte(transactions.date, range.end));
    }

    const [row] = this.db
      .select({
        income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} < 0 THEN -${transactions.amountCents} ELSE 0 END), 0)`,
        expenses: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} > 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(linkedItems, eq(accounts.linkedItemId, linkedItems.id))
      .where(and(...conds))
      .all();

    const totalIncomeCents = Number(row?.income ?? 0);
    const totalExpensesCents = Number(row?.expenses ?? 0);
    return {
      totalIncomeCents,
      totalExpensesCents,
      balanceCents: totalIncomeCents - totalExpensesCents,
      ...(range ? { start: range.start, end: range.end } : {}),
    };
  }

  totalsByCategory(userId: number, range: { start: string; end: string }) {
    return this.db
      .select({
        categoryId: transactions.userCategoryId,
        slug: categories.slug,
        name: categories.name,
        spendCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} > 0 AND ${transactions.isTransfer} = 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(linkedItems, eq(accounts.linkedItemId, linkedItems.id))
      .leftJoin(categories, eq(transactions.userCategoryId, categories.id))
      .where(
        and(
          eq(linkedItems.userId, userId),
          gte(transactions.date, range.start),
          lte(transactions.date, range.end),
        ),
      )
      .groupBy(transactions.userCategoryId, categories.slug, categories.name)
      .all();
  }
}
