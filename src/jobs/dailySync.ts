import cron from 'node-cron';
import type { AppContext } from '../context';

export function scheduleDailySync(ctx: AppContext): cron.ScheduledTask {
  const cronExpr = process.env.SYNC_CRON ?? '15 6 * * *';
  return cron.schedule(
    cronExpr,
    () => {
      if (!ctx.syncService) {
        return;
      }
      void ctx.syncService.syncAllActiveItems().catch(() => {
        /* errors recorded in sync_runs */
      });
    },
    { timezone: process.env.SYNC_TZ ?? 'America/Toronto' },
  );
}
