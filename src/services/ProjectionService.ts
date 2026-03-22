import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { accounts, linkedItems, projectionInputs, transactions } from '../db/schema';

export type IncomeSchedule = {
  amountCents: number;
  intervalDays: number;
  anchorDate: string;
};

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export class ProjectionService {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  private rollingStats(userId: number, days: number) {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const [row] = this.db
      .select({
        expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} > 0 AND ${transactions.isTransfer} = 0 THEN ${transactions.amountCents} ELSE 0 END), 0)`,
        income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.amountCents} < 0 AND ${transactions.isTransfer} = 0 THEN -${transactions.amountCents} ELSE 0 END), 0)`,
        daysWithSpend: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.amountCents} > 0 AND ${transactions.isTransfer} = 0 THEN ${transactions.date} END)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .innerJoin(linkedItems, eq(accounts.linkedItemId, linkedItems.id))
      .where(
        and(
          eq(linkedItems.userId, userId),
          gte(transactions.date, startStr),
          lte(transactions.date, endStr),
        ),
      )
      .all();

    const totalExpenseCents = Number(row?.expense ?? 0);
    const totalIncomeCents = Number(row?.income ?? 0);
    const denom = Math.max(1, days);
    return {
      windowStart: startStr,
      windowEnd: endStr,
      totalExpenseCents,
      totalIncomeCents,
      averageDailySpendCents: Math.round(totalExpenseCents / denom),
      averageDailyIncomeCentsFromTx: Math.round(totalIncomeCents / denom),
      daysWithSpend: Number(row?.daysWithSpend ?? 0),
    };
  }

  getProjections(userId: number, horizonDays: number) {
    const h = Math.min(Math.max(horizonDays, 7), 365);
    const s30 = this.rollingStats(userId, 30);
    const s90 = this.rollingStats(userId, 90);

    const [projRow] = this.db.select().from(projectionInputs).where(eq(projectionInputs.userId, userId)).limit(1).all();

    let schedule: IncomeSchedule = { amountCents: 0, intervalDays: 14, anchorDate: s30.windowEnd };
    if (projRow?.incomeScheduleJson) {
      try {
        schedule = { ...schedule, ...JSON.parse(projRow.incomeScheduleJson) };
      } catch {
        /* keep default */
      }
    }

    const today = new Date();
    const horizonEnd = new Date(today);
    horizonEnd.setUTCDate(horizonEnd.getUTCDate() + h);
    const horizonDaysActual = daysBetween(today, horizonEnd);

    const payIntervals = Math.max(0, Math.floor(horizonDaysActual / Math.max(1, schedule.intervalDays)));
    const projectedIncomeFromScheduleCents = schedule.amountCents * payIntervals;

    const projectedSpendCents = s90.averageDailySpendCents * horizonDaysActual;
    const projectedSurplusCents = projectedIncomeFromScheduleCents - projectedSpendCents;

    const goalCents = projRow?.savingsGoalAmountCents ?? null;
    const targetDate = projRow?.targetDate ?? null;
    let goalTrajectory:
      | {
          targetDate: string;
          goalAmountCents: number;
          projectedSavingsCents: number;
          onTrack: boolean;
          suggestedWeeklyCutCents: number | null;
        }
      | undefined;

    if (goalCents != null && targetDate) {
      const goalDate = new Date(targetDate + 'T12:00:00Z');
      const daysToGoal = daysBetween(today, goalDate);
      const dailyNetFromSchedule =
        schedule.intervalDays > 0 ? Math.round(schedule.amountCents / schedule.intervalDays) - s90.averageDailySpendCents : -s90.averageDailySpendCents;
      const projectedSavingsCents = dailyNetFromSchedule * Math.max(0, daysToGoal);
      const onTrack = projectedSavingsCents >= goalCents;
      const shortfall = goalCents - projectedSavingsCents;
      const weeksToGoal = Math.max(1, Math.ceil(daysToGoal / 7));
      const suggestedWeeklyCutCents = !onTrack && daysToGoal > 0 ? Math.max(0, Math.ceil(shortfall / weeksToGoal)) : null;
      goalTrajectory = {
        targetDate,
        goalAmountCents: goalCents,
        projectedSavingsCents,
        onTrack,
        suggestedWeeklyCutCents,
      };
    }

    return {
      horizonDays: h,
      windows: {
        last30d: s30,
        last90d: s90,
      },
      projectedSpendCentsOverHorizon: projectedSpendCents,
      projectedIncomeFromScheduleCents: projectedIncomeFromScheduleCents,
      projectedNetCentsOverHorizon: projectedSurplusCents,
      incomeSchedule: schedule,
      savingsGoal: goalTrajectory,
    };
  }

  upsertProjectionInputs(
    userId: number,
    patch: Partial<{ savingsGoalAmountCents: number | null; targetDate: string | null; incomeSchedule: IncomeSchedule }>,
  ): void {
    const existing = this.db.select().from(projectionInputs).where(eq(projectionInputs.userId, userId)).limit(1).all()[0];
    const defaultSchedule = JSON.stringify({
      amountCents: 0,
      intervalDays: 14,
      anchorDate: new Date().toISOString().slice(0, 10),
    });
    const next = {
      savingsGoalAmountCents:
        patch.savingsGoalAmountCents !== undefined ? patch.savingsGoalAmountCents : existing?.savingsGoalAmountCents ?? null,
      targetDate: patch.targetDate !== undefined ? patch.targetDate : existing?.targetDate ?? null,
      incomeScheduleJson:
        patch.incomeSchedule != null ? JSON.stringify(patch.incomeSchedule) : existing?.incomeScheduleJson ?? defaultSchedule,
      updatedAt: new Date(),
    };
    if (existing) {
      this.db.update(projectionInputs).set(next).where(eq(projectionInputs.userId, userId)).run();
    } else {
      this.db.insert(projectionInputs).values({ userId, ...next }).run();
    }
  }
}
