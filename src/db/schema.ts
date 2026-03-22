import { relations, sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const linkedItems = sqliteTable('linked_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  plaidItemId: text('plaid_item_id').notNull().unique(),
  institutionId: text('institution_id'),
  institutionName: text('institution_name'),
  accessTokenEnc: text('access_token_enc').notNull(),
  transactionsCursor: text('transactions_cursor'),
  lastSuccessfulSyncAt: integer('last_successful_sync_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    linkedItemId: integer('linked_item_id')
      .notNull()
      .references(() => linkedItems.id),
    plaidAccountId: text('plaid_account_id').notNull(),
    name: text('name').notNull(),
    type: text('type'),
    subtype: text('subtype'),
    mask: text('mask'),
    currency: text('currency').notNull().default('CAD'),
  },
  (t) => ({
    itemPlaidUq: uniqueIndex('accounts_item_plaid_uq').on(t.linkedItemId, t.plaidAccountId),
  }),
);

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
  },
  (t) => ({
    userSlugUq: uniqueIndex('categories_user_slug_uq').on(t.userId, t.slug),
  }),
);

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  dedupeKey: text('dedupe_key').notNull().unique(),
  providerTransactionId: text('provider_transaction_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  isoCurrencyCode: text('iso_currency_code').notNull().default('CAD'),
  date: text('date').notNull(),
  name: text('name'),
  merchantName: text('merchant_name'),
  pending: integer('pending', { mode: 'boolean' }).notNull().default(false),
  providerCategoryPrimary: text('provider_category_primary'),
  providerCategoryDetail: text('provider_category_detail'),
  userCategoryId: integer('user_category_id').references(() => categories.id),
  isTransfer: integer('is_transfer', { mode: 'boolean' }).notNull().default(false),
  source: text('source').notNull().default('plaid'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const categoryRules = sqliteTable('category_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  pattern: text('pattern').notNull(),
  targetCategoryId: integer('target_category_id')
    .notNull()
    .references(() => categories.id),
  priority: integer('priority').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const projectionInputs = sqliteTable('projection_inputs', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id),
  savingsGoalAmountCents: integer('savings_goal_amount_cents'),
  targetDate: text('target_date'),
  incomeScheduleJson: text('income_schedule_json'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const syncRuns = sqliteTable('sync_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  linkedItemId: integer('linked_item_id')
    .notNull()
    .references(() => linkedItems.id),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  status: text('status').notNull(),
  errorMessage: text('error_message'),
  upsertedCount: integer('upserted_count').default(0),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  linkedItems: many(linkedItems),
  categories: many(categories),
  projectionInputs: one(projectionInputs),
}));

export const linkedItemsRelations = relations(linkedItems, ({ one, many }) => ({
  user: one(users, { fields: [linkedItems.userId], references: [users.id] }),
  accounts: many(accounts),
  syncRuns: many(syncRuns),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  linkedItem: one(linkedItems, {
    fields: [accounts.linkedItemId],
    references: [linkedItems.id],
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  userCategory: one(categories, {
    fields: [transactions.userCategoryId],
    references: [categories.id],
  }),
}));
