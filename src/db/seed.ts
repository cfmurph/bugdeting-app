import { asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { accounts, categories, linkedItems, projectionInputs, users } from './schema';
import { encryptToken } from '../utils/tokenCrypto';

const DEFAULT_CATEGORY_SEED: { slug: string; name: string }[] = [
  { slug: 'groceries', name: 'Groceries' },
  { slug: 'rent', name: 'Rent' },
  { slug: 'utilities', name: 'Utilities' },
  { slug: 'transportation', name: 'Transportation' },
  { slug: 'entertainment', name: 'Entertainment' },
  { slug: 'dining', name: 'Dining' },
  { slug: 'shopping', name: 'Shopping' },
  { slug: 'healthcare', name: 'Healthcare' },
  { slug: 'income', name: 'Income' },
  { slug: 'transfer', name: 'Transfer' },
  { slug: 'other', name: 'Other' },
];

export function seedDefaultUser(db: BetterSQLite3Database<typeof schema>): number {
  const existing = db.select().from(users).limit(1).all();
  if (existing.length > 0) {
    return existing[0].id;
  }

  const [u] = db
    .insert(users)
    .values({ email: process.env.DEFAULT_USER_EMAIL ?? 'default@local' })
    .returning({ id: users.id })
    .all();
  const userId = u.id;

  for (const c of DEFAULT_CATEGORY_SEED) {
    db.insert(categories).values({ userId, slug: c.slug, name: c.name }).run();
  }

  const manualPlaidItemId = `manual-local-${userId}`;
  db.insert(linkedItems)
    .values({
      userId,
      plaidItemId: manualPlaidItemId,
      institutionId: 'manual',
      institutionName: 'Manual entries',
      accessTokenEnc: encryptToken('__manual__'),
      status: 'manual',
    })
    .run();

  const [manualItem] = db.select().from(linkedItems).where(eq(linkedItems.plaidItemId, manualPlaidItemId)).all();

  db.insert(accounts)
    .values({
      linkedItemId: manualItem.id,
      plaidAccountId: `manual-account-${userId}`,
      name: 'Manual / cash',
      type: 'other',
      currency: 'CAD',
    })
    .run();

  db.insert(projectionInputs)
    .values({
      userId,
      incomeScheduleJson: JSON.stringify({
        amountCents: 0,
        intervalDays: 14,
        anchorDate: new Date().toISOString().slice(0, 10),
      }),
    })
    .run();

  return userId;
}

export function getDefaultUserId(db: BetterSQLite3Database<typeof schema>): number {
  const row = db.select().from(users).orderBy(asc(users.id)).limit(1).all();
  if (!row.length) {
    return seedDefaultUser(db);
  }
  return row[0].id;
}
