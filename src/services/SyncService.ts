import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { PlaidApi, Transaction as PlaidTransaction } from 'plaid';
import * as schema from '../db/schema';
import { accounts, linkedItems, syncRuns, transactions } from '../db/schema';
import { decryptToken } from '../utils/tokenCrypto';
import { CategorizationService } from './CategorizationService';

export class SyncService {
  private categorization: CategorizationService;

  constructor(
    private db: BetterSQLite3Database<typeof schema>,
    private plaid: PlaidApi,
  ) {
    this.categorization = new CategorizationService(db);
  }

  private upsertAccounts(
    linkedItemId: number,
    plaidAccounts: { account_id: string; name: string; type?: string; subtype?: string | null; mask?: string | null; balances?: { iso_currency_code?: string | null } | null }[],
  ): void {
    for (const a of plaidAccounts) {
      const currency = a.balances?.iso_currency_code ?? 'CAD';
      this.db
        .insert(accounts)
        .values({
          linkedItemId,
          plaidAccountId: a.account_id,
          name: a.name,
          type: a.type ?? null,
          subtype: a.subtype ?? null,
          mask: a.mask ?? null,
          currency,
        })
        .onConflictDoUpdate({
          target: [accounts.linkedItemId, accounts.plaidAccountId],
          set: {
            name: sql`excluded.name`,
            type: sql`excluded.type`,
            subtype: sql`excluded.subtype`,
            mask: sql`excluded.mask`,
            currency: sql`excluded.currency`,
          },
        })
        .run();
    }
  }

  private accountMapForItem(linkedItemId: number): Map<string, number> {
    const rows = this.db.select().from(accounts).where(eq(accounts.linkedItemId, linkedItemId)).all();
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.plaidAccountId, r.id);
    }
    return map;
  }

  private plaidTxToRow(
    plaidItemId: string,
    accountId: number,
    tx: PlaidTransaction,
    userCategoryId: number | null,
  ) {
    const pfc = tx.personal_finance_category;
    const primary = pfc?.primary ?? null;
    const detailed = pfc?.detailed ?? null;
    const isTransfer =
      (primary?.toUpperCase().includes('TRANSFER') ?? false) ||
      (detailed?.toUpperCase().includes('TRANSFER') ?? false);
    const amountCents = Math.round(Number(tx.amount) * 100);
    const iso = tx.iso_currency_code ?? 'CAD';
    const dedupeKey = `${plaidItemId}:${tx.transaction_id}`;
    return {
      accountId,
      dedupeKey,
      providerTransactionId: tx.transaction_id,
      amountCents,
      isoCurrencyCode: iso,
      date: tx.date,
      name: tx.name,
      merchantName: tx.merchant_name ?? null,
      pending: tx.pending,
      providerCategoryPrimary: primary,
      providerCategoryDetail: detailed,
      userCategoryId,
      isTransfer,
      source: 'plaid' as const,
    };
  }

  async syncLinkedItem(linkedItemDbId: number): Promise<{ upserted: number }> {
    const [item] = this.db.select().from(linkedItems).where(eq(linkedItems.id, linkedItemDbId)).limit(1).all();
    if (!item || item.status === 'manual') {
      return { upserted: 0 };
    }

    const userId = item.userId;
    const accessToken = decryptToken(item.accessTokenEnc);
    const plaidItemId = item.plaidItemId;

    const [run] = this.db
      .insert(syncRuns)
      .values({ linkedItemId: linkedItemDbId, startedAt: new Date(), status: 'running' })
      .returning({ id: syncRuns.id })
      .all();

    let upserted = 0;
    try {
      const acctResp = await this.plaid.accountsGet({ access_token: accessToken });
      this.upsertAccounts(item.id, acctResp.data.accounts);

      let cursor: string | undefined = item.transactionsCursor ?? undefined;
      let hasMore = true;

      while (hasMore) {
        const resp = await this.plaid.transactionsSync({
          access_token: accessToken,
          cursor: cursor || undefined,
          count: 500,
        });
        const data = resp.data;
        cursor = data.next_cursor;
        hasMore = data.has_more;

        this.upsertAccounts(item.id, data.accounts);
        const accountMap = this.accountMapForItem(item.id);

        const toUpsert: PlaidTransaction[] = [...data.added, ...data.modified];
        for (const tx of toUpsert) {
          const aid = accountMap.get(tx.account_id);
          if (aid == null) {
            continue;
          }
          const catId = this.categorization.resolveCategoryId(
            userId,
            tx.merchant_name,
            tx.name,
            tx.personal_finance_category?.primary ?? null,
            tx.personal_finance_category?.detailed ?? null,
          );
          const row = this.plaidTxToRow(plaidItemId, aid, tx, catId);

          this.db
            .insert(transactions)
            .values(row)
            .onConflictDoUpdate({
              target: transactions.dedupeKey,
              set: {
                amountCents: sql`excluded.amount_cents`,
                isoCurrencyCode: sql`excluded.iso_currency_code`,
                date: sql`excluded.date`,
                name: sql`excluded.name`,
                merchantName: sql`excluded.merchant_name`,
                pending: sql`excluded.pending`,
                providerCategoryPrimary: sql`excluded.provider_category_primary`,
                providerCategoryDetail: sql`excluded.provider_category_detail`,
                isTransfer: sql`excluded.is_transfer`,
                userCategoryId: sql`transactions.user_category_id`,
              },
            })
            .run();
          upserted += 1;
        }

        for (const rem of data.removed) {
          const dedupeKey = `${plaidItemId}:${rem.transaction_id}`;
          this.db.delete(transactions).where(eq(transactions.dedupeKey, dedupeKey)).run();
        }
      }

      this.db
        .update(linkedItems)
        .set({
          transactionsCursor: cursor ?? null,
          lastSuccessfulSyncAt: new Date(),
          status: 'active',
        })
        .where(eq(linkedItems.id, linkedItemDbId))
        .run();

      this.db
        .update(syncRuns)
        .set({ finishedAt: new Date(), status: 'success', upsertedCount: upserted })
        .where(eq(syncRuns.id, run.id))
        .run();

      this.categorization.backfillUncategorized(userId);

      return { upserted };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.db
        .update(linkedItems)
        .set({ status: 'error' })
        .where(eq(linkedItems.id, linkedItemDbId))
        .run();
      this.db
        .update(syncRuns)
        .set({ finishedAt: new Date(), status: 'error', errorMessage: msg, upsertedCount: upserted })
        .where(eq(syncRuns.id, run.id))
        .run();
      throw e;
    }
  }

  async syncAllActiveItems(): Promise<void> {
    const items = this.db.select().from(linkedItems).where(eq(linkedItems.status, 'active')).all();
    for (const it of items) {
      try {
        await this.syncLinkedItem(it.id);
      } catch {
        /* logged per sync_runs */
      }
    }
  }
}
