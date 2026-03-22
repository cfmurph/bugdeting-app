import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { categories, categoryRules, transactions } from '../db/schema';
import { plaidPrimaryToSlug } from './plaidCategoryMap';

export class CategorizationService {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  private slugToId(userId: number, slug: string): number | null {
    const [row] = this.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.slug, slug)))
      .limit(1)
      .all();
    return row?.id ?? null;
  }

  resolveCategoryId(
    userId: number,
    merchantName: string | null | undefined,
    name: string | null | undefined,
    providerPrimary: string | null | undefined,
    providerDetail: string | null | undefined,
  ): number | null {
    const haystack = `${merchantName ?? ''} ${name ?? ''}`.toLowerCase();
    const rules = this.db
      .select()
      .from(categoryRules)
      .where(eq(categoryRules.userId, userId))
      .orderBy(desc(categoryRules.priority), asc(categoryRules.id))
      .all();
    for (const r of rules) {
      if (haystack.includes(r.pattern.toLowerCase())) {
        return r.targetCategoryId;
      }
    }
    const slug = plaidPrimaryToSlug(providerPrimary);
    const transferHint =
      (providerPrimary?.toUpperCase().includes('TRANSFER') ?? false) ||
      (providerDetail?.toUpperCase().includes('TRANSFER') ?? false);
    const id = this.slugToId(userId, transferHint ? 'transfer' : slug);
    return id;
  }

  /** Apply rules + provider map to transactions missing user_category_id. */
  backfillUncategorized(userId: number): number {
    const acctIds = this.db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .innerJoin(schema.linkedItems, eq(schema.accounts.linkedItemId, schema.linkedItems.id))
      .where(eq(schema.linkedItems.userId, userId))
      .all()
      .map((r) => r.id);

    if (acctIds.length === 0) {
      return 0;
    }

    let updated = 0;
    const pending = this.db
      .select()
      .from(transactions)
      .where(and(isNull(transactions.userCategoryId), inArray(transactions.accountId, acctIds)))
      .all();

    for (const t of pending) {
      const catId = this.resolveCategoryId(
        userId,
        t.merchantName,
        t.name,
        t.providerCategoryPrimary,
        t.providerCategoryDetail,
      );
      if (catId != null) {
        this.db.update(transactions).set({ userCategoryId: catId }).where(eq(transactions.id, t.id)).run();
        updated += 1;
      }
    }
    return updated;
  }

  listRules(userId: number) {
    return this.db.select().from(categoryRules).where(eq(categoryRules.userId, userId)).orderBy(desc(categoryRules.priority)).all();
  }

  addRule(userId: number, pattern: string, targetCategoryId: number, priority = 0) {
    const rows = this.db
      .insert(categoryRules)
      .values({ userId, pattern, targetCategoryId, priority })
      .returning({ id: categoryRules.id })
      .all();
    return rows[0];
  }

  deleteRule(userId: number, ruleId: number): boolean {
    const r = this.db.delete(categoryRules).where(and(eq(categoryRules.id, ruleId), eq(categoryRules.userId, userId))).run();
    return r.changes > 0;
  }

  setTransactionCategory(userId: number, transactionId: number, categoryId: number | null): boolean {
    const owns = this.db
      .select({ id: transactions.id })
      .from(transactions)
      .innerJoin(schema.accounts, eq(transactions.accountId, schema.accounts.id))
      .innerJoin(schema.linkedItems, eq(schema.accounts.linkedItemId, schema.linkedItems.id))
      .where(
        and(eq(transactions.id, transactionId), eq(schema.linkedItems.userId, userId)),
      )
      .limit(1)
      .all();
    if (!owns.length) {
      return false;
    }
    this.db.update(transactions).set({ userCategoryId: categoryId }).where(eq(transactions.id, transactionId)).run();
    return true;
  }

  listCategories(userId: number) {
    return this.db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.slug)).all();
  }
}
