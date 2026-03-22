import { getDb, initDb, resetDbSingleton } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { getDefaultUserId, seedDefaultUser } from '../src/db/seed';
import { TransactionService } from '../src/services/TransactionService';

describe('TransactionService', () => {
  let transactionService: TransactionService;
  let userId: number;

  beforeEach(() => {
    resetDbSingleton();
    initDb(':memory:');
    runMigrations();
    const db = getDb();
    seedDefaultUser(db);
    userId = getDefaultUserId(db);
    transactionService = new TransactionService(db);
  });

  afterEach(() => {
    resetDbSingleton();
  });

  it('should add an income transaction', () => {
    transactionService.addTransactionLegacy(userId, 'income', 1000, 'Salary', new Date('2024-01-15'));
    const transactions = transactionService.listForUser(userId);
    const row = transactions.find((t) => t.name === 'Salary');
    expect(row).toBeDefined();
    expect(row!.amountCents).toBe(-100000);
  });

  it('should add an expense transaction', () => {
    transactionService.addTransactionLegacy(userId, 'expense', 200, 'Groceries', new Date('2024-01-16'));
    const transactions = transactionService.listForUser(userId);
    const row = transactions.find((t) => t.name === 'Groceries');
    expect(row).toBeDefined();
    expect(row!.amountCents).toBe(20000);
  });

  it('should return all transactions', () => {
    transactionService.addTransactionLegacy(userId, 'income', 500, 'Freelance', new Date('2024-02-01'));
    transactionService.addTransactionLegacy(userId, 'expense', 150, 'Utilities', new Date('2024-02-02'));
    const transactions = transactionService.listForUser(userId);
    expect(transactions.length).toBeGreaterThanOrEqual(2);
    expect(transactions.map((t) => t.name)).toEqual(expect.arrayContaining(['Freelance', 'Utilities']));
  });
});
