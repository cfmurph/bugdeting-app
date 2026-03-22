import { createHash } from 'crypto';
import * as jose from 'jose';
import type { PlaidApi } from 'plaid';

export async function verifyPlaidWebhook(
  rawBody: Buffer,
  plaidVerificationHeader: string | undefined,
  plaidClient: PlaidApi,
): Promise<void> {
  if (process.env.PLAID_SKIP_WEBHOOK_VERIFY === 'true') {
    return;
  }
  if (!plaidVerificationHeader) {
    throw new Error('Missing Plaid-Verification header');
  }
  const header = jose.decodeProtectedHeader(plaidVerificationHeader);
  const kid = header.kid;
  if (!kid) {
    throw new Error('JWT missing kid');
  }
  const keyResp = await plaidClient.webhookVerificationKeyGet({ key_id: String(kid) });
  const jwk = keyResp.data.key as jose.JWK;
  const key = await jose.importJWK(jwk, 'ES256');
  const { payload } = await jose.jwtVerify(plaidVerificationHeader, key);
  const expected = payload.request_body_sha256;
  if (typeof expected !== 'string') {
    throw new Error('Invalid webhook JWT payload');
  }
  const actual = createHash('sha256').update(rawBody).digest('hex');
  if (actual !== expected) {
    throw new Error('Webhook body SHA256 mismatch');
  }
}
