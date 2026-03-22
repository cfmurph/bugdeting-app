import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

export type PlaidEnvName = keyof typeof PlaidEnvironments;

export function createPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const envName = (process.env.PLAID_ENV ?? 'sandbox') as PlaidEnvName;
  const basePath = PlaidEnvironments[envName];
  if (!basePath) {
    throw new Error(`Invalid PLAID_ENV: ${envName}`);
  }
  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set to use Plaid');
  }
  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });
  return new PlaidApi(configuration);
}

export const plaidProductsForBudgetApp: Products[] = [Products.Transactions];

export const plaidCountryCodes: CountryCode[] = [CountryCode.Ca];
