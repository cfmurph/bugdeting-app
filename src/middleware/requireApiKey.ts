import type { RequestHandler } from 'express';

export const requireApiKey: RequestHandler = (req, res, next) => {
  const key = process.env.API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ error: 'API_KEY is required in production' });
      return;
    }
    next();
    return;
  }
  const sent =
    req.header('x-api-key') ?? req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (sent !== key) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};
