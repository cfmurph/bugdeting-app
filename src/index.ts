import 'dotenv/config';
import { bootstrapApp, getContext } from './context';
import { createApp } from './app';
import { scheduleDailySync } from './jobs/dailySync';

bootstrapApp();
const ctx = getContext();
scheduleDailySync(ctx);

const app = createApp(ctx);
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Budgeting application is running on http://localhost:${PORT}`);
});
