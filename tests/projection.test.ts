import { getDb, initDb, resetDbSingleton } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { getDefaultUserId, seedDefaultUser } from '../src/db/seed';
import { ProjectionService } from '../src/services/ProjectionService';
import { TransactionService } from '../src/services/TransactionService';

describe('ProjectionService', () => {
  afterEach(() => {
    resetDbSingleton();
  });

  it('computes rolling windows and horizon projection', () => {
    resetDbSingleton();
    initDb(':memory:');
    runMigrations();
    const db = getDb();
    seedDefaultUser(db);
    const userId = getDefaultUserId(db);
    const txSvc = new TransactionService(db);
    const proj = new ProjectionService(db);

    const d0 = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const d1 = new Date(d0);
    d1.setUTCDate(d1.getUTCDate() - 2);
    const d2 = new Date(d0);
    d2.setUTCDate(d2.getUTCDate() - 1);

    txSvc.addTransactionLegacy(userId, 'income', 3000, 'Pay', iso(d1));
    txSvc.addTransactionLegacy(userId, 'expense', 100, 'Coffee', iso(d2));
    txSvc.addTransactionLegacy(userId, 'expense', 400, 'Shop', iso(d0));

    proj.upsertProjectionInputs(userId, {
      incomeSchedule: { amountCents: 300000, intervalDays: 14, anchorDate: iso(d1) },
    });

    const out = proj.getProjections(userId, 30);
    expect(out.horizonDays).toBe(30);
    expect(out.windows.last30d.totalExpenseCents).toBeGreaterThanOrEqual(50000);
    expect(out.windows.last30d.totalIncomeCents).toBeGreaterThanOrEqual(300000);
    expect(out.projectedSpendCentsOverHorizon).toBeGreaterThan(0);
  });
});
