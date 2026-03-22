import express, { type Express, type Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import type { AppContext } from './context';
import { getContext } from './context';
import { linkedItems, syncRuns } from './db/schema';
import { decryptToken, encryptToken } from './utils/tokenCrypto';
import { plaidCountryCodes, plaidProductsForBudgetApp } from './integrations/plaidClient';
import { requireApiKey } from './middleware/requireApiKey';
import { verifyPlaidWebhook } from './utils/plaidWebhookVerify';

function plaidNotConfigured(res: Response): void {
  res.status(503).json({ error: 'Plaid is not configured (set PLAID_CLIENT_ID and PLAID_SECRET)' });
}

export function createApp(ctx: AppContext = getContext()): Express {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/webhooks/plaid', express.raw({ type: 'application/json' }), async (req, res) => {
    const raw = req.body as Buffer;
    if (!ctx.plaid || !ctx.syncService) {
      res.status(503).send('Plaid not configured');
      return;
    }
    try {
      await verifyPlaidWebhook(raw, req.get('Plaid-Verification'), ctx.plaid);
      const body = JSON.parse(raw.toString('utf8')) as { webhook_type?: string; item_id?: string };
      if (body.webhook_type === 'TRANSACTIONS' && body.item_id) {
        const [row] = ctx.db.select().from(linkedItems).where(eq(linkedItems.plaidItemId, body.item_id)).limit(1).all();
        if (row && row.status === 'active') {
          await ctx.syncService.syncLinkedItem(row.id);
        }
      }
      res.json({ received: true });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.use(express.json());
  app.use(requireApiKey);

  app.get('/budget', (req, res) => {
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;
    const range = start && end ? { start, end } : undefined;
    const summary = ctx.budgetService.getBudgetSummary(ctx.defaultUserId, range);
    res.json(summary);
  });

  app.post('/transaction', (req, res) => {
    const { type, amount, description, date } = req.body as {
      type?: string;
      amount?: number;
      description?: string;
      date?: string;
    };
    if (!type || amount == null || !description || !date) {
      res.status(400).json({ error: 'type, amount, description, date required' });
      return;
    }
    if (type !== 'income' && type !== 'expense') {
      res.status(400).json({ error: 'type must be income or expense' });
      return;
    }
    ctx.transactionService.addTransactionLegacy(ctx.defaultUserId, type, amount, description, date);
    res.status(201).json({ ok: true });
  });

  app.get('/transactions', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 500;
    const rows = ctx.transactionService.listForUser(ctx.defaultUserId, Number.isFinite(limit) ? limit : 500);
    res.json(rows);
  });

  app.get('/projections', (req, res) => {
    const horizon = req.query.horizon ? parseInt(String(req.query.horizon).replace(/d$/i, ''), 10) : 90;
    const data = ctx.projectionService.getProjections(ctx.defaultUserId, horizon);
    res.json(data);
  });

  app.patch('/projection-inputs', (req, res) => {
    const { savingsGoalAmountCents, targetDate, incomeSchedule } = req.body as {
      savingsGoalAmountCents?: number | null;
      targetDate?: string | null;
      incomeSchedule?: { amountCents: number; intervalDays: number; anchorDate: string };
    };
    ctx.projectionService.upsertProjectionInputs(ctx.defaultUserId, {
      savingsGoalAmountCents,
      targetDate,
      incomeSchedule,
    });
    res.json({ ok: true });
  });

  app.get('/categories', (_req, res) => {
    res.json(ctx.categorizationService.listCategories(ctx.defaultUserId));
  });

  app.get('/category-rules', (_req, res) => {
    res.json(ctx.categorizationService.listRules(ctx.defaultUserId));
  });

  app.post('/category-rules', (req, res) => {
    const { pattern, targetCategoryId, priority } = req.body as {
      pattern?: string;
      targetCategoryId?: number;
      priority?: number;
    };
    if (!pattern || targetCategoryId == null) {
      res.status(400).json({ error: 'pattern and targetCategoryId required' });
      return;
    }
    const row = ctx.categorizationService.addRule(ctx.defaultUserId, pattern, targetCategoryId, priority ?? 0);
    res.status(201).json(row);
  });

  app.delete('/category-rules/:id', (req, res) => {
    const id = Number(req.params.id);
    const ok = ctx.categorizationService.deleteRule(ctx.defaultUserId, id);
    res.status(ok ? 204 : 404).send();
  });

  app.patch('/transactions/:id/category', (req, res) => {
    const id = Number(req.params.id);
    const { categoryId } = req.body as { categoryId?: number | null };
    if (categoryId === undefined) {
      res.status(400).json({ error: 'categoryId required (null to clear)' });
      return;
    }
    const ok = ctx.categorizationService.setTransactionCategory(ctx.defaultUserId, id, categoryId);
    res.status(ok ? 200 : 404).json({ ok });
  });

  app.post('/categorization/backfill', (_req, res) => {
    const n = ctx.categorizationService.backfillUncategorized(ctx.defaultUserId);
    res.json({ updated: n });
  });

  app.get('/sync-runs', (_req, res) => {
    const rows = ctx.db
      .select()
      .from(syncRuns)
      .orderBy(desc(syncRuns.startedAt))
      .limit(50)
      .all();
    res.json(rows);
  });

  app.post('/plaid/link-token/create', async (_req, res) => {
    if (!ctx.plaid) {
      plaidNotConfigured(res);
      return;
    }
    try {
      const r = await ctx.plaid.linkTokenCreate({
        user: { client_user_id: String(ctx.defaultUserId) },
        client_name: process.env.PLAID_CLIENT_NAME ?? 'Budget App (CA)',
        products: plaidProductsForBudgetApp,
        country_codes: plaidCountryCodes,
        language: 'en',
      });
      res.json({ link_token: r.data.link_token, expiration: r.data.expiration });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post('/plaid/item/public-token/exchange', async (req, res) => {
    if (!ctx.plaid || !ctx.syncService) {
      plaidNotConfigured(res);
      return;
    }
    const { public_token } = req.body as { public_token?: string };
    if (!public_token) {
      res.status(400).json({ error: 'public_token required' });
      return;
    }
    try {
      const ex = await ctx.plaid.itemPublicTokenExchange({ public_token });
      const accessToken = ex.data.access_token;
      const itemId = ex.data.item_id;
      const itemResp = await ctx.plaid.itemGet({ access_token: accessToken });
      const plaidItem = itemResp.data.item;
      let institutionName: string | null = null;
      if (plaidItem.institution_id) {
        try {
          const ir = await ctx.plaid.institutionsGetById({
            institution_id: plaidItem.institution_id,
            country_codes: plaidCountryCodes,
          });
          institutionName = ir.data.institution.name;
        } catch {
          institutionName = null;
        }
      }
      ctx.db
        .insert(linkedItems)
        .values({
          userId: ctx.defaultUserId,
          plaidItemId: itemId,
          institutionId: plaidItem.institution_id ?? null,
          institutionName,
          accessTokenEnc: encryptToken(accessToken),
          status: 'active',
        })
        .onConflictDoUpdate({
          target: linkedItems.plaidItemId,
          set: {
            accessTokenEnc: encryptToken(accessToken),
            institutionId: plaidItem.institution_id ?? null,
            institutionName,
            status: 'active',
          },
        })
        .run();

      const [row] = ctx.db.select().from(linkedItems).where(eq(linkedItems.plaidItemId, itemId)).limit(1).all();
      await ctx.syncService.syncLinkedItem(row.id);
      res.status(201).json({ linked_item_id: row.id, plaid_item_id: itemId });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get('/plaid/accounts', async (_req, res) => {
    if (!ctx.plaid) {
      plaidNotConfigured(res);
      return;
    }
    const items = ctx.db
      .select()
      .from(linkedItems)
      .where(eq(linkedItems.userId, ctx.defaultUserId))
      .all();
    const out: unknown[] = [];
    try {
      for (const it of items) {
        if (it.status === 'manual') {
          continue;
        }
        const token = decryptToken(it.accessTokenEnc);
        const accts = await ctx.plaid.accountsGet({ access_token: token });
        out.push({
          linked_item_id: it.id,
          plaid_item_id: it.plaidItemId,
          institution_name: it.institutionName,
          accounts: accts.data.accounts,
        });
      }
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get('/plaid/institutions/search', async (req, res) => {
    if (!ctx.plaid) {
      plaidNotConfigured(res);
      return;
    }
    const q = (req.query.q as string) || 'RBC';
    try {
      const r = await ctx.plaid.institutionsSearch({
        query: q,
        country_codes: plaidCountryCodes,
      });
      res.json(r.data.institutions);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post('/plaid/sync', async (req, res) => {
    if (!ctx.syncService) {
      plaidNotConfigured(res);
      return;
    }
    const linkedItemId = (req.body as { linkedItemId?: number }).linkedItemId;
    try {
      if (linkedItemId != null) {
        const owns = ctx.db
          .select({ id: linkedItems.id })
          .from(linkedItems)
          .where(and(eq(linkedItems.id, linkedItemId), eq(linkedItems.userId, ctx.defaultUserId)))
          .limit(1)
          .all();
        if (!owns.length) {
          res.status(404).json({ error: 'Linked item not found' });
          return;
        }
        const result = await ctx.syncService.syncLinkedItem(linkedItemId);
        res.json(result);
        return;
      }
      await ctx.syncService.syncAllActiveItems();
      res.json({ ok: true, scope: 'all_active' });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return app;
}
