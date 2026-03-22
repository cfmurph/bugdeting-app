/** Map Plaid personal_finance_category.primary (uppercase) to our canonical slug. */
const PLAID_PRIMARY_TO_SLUG: Record<string, string> = {
  FOOD_AND_DRINK: 'groceries',
  GENERAL_MERCHANDISE: 'shopping',
  TRANSPORTATION: 'transportation',
  TRAVEL: 'entertainment',
  ENTERTAINMENT: 'entertainment',
  HOME_IMPROVEMENT: 'utilities',
  MEDICAL: 'healthcare',
  PERSONAL_CARE: 'healthcare',
  GENERAL_SERVICES: 'utilities',
  GOVERNMENT_AND_NON_PROFIT: 'other',
  INCOME: 'income',
  TRANSFER_IN: 'transfer',
  TRANSFER_OUT: 'transfer',
  TRANSFER: 'transfer',
  LOAN_PAYMENTS: 'utilities',
  BANK_FEES: 'other',
  RENT_AND_UTILITIES: 'rent',
};

export function plaidPrimaryToSlug(primary: string | null | undefined): string {
  if (!primary) {
    return 'other';
  }
  const key = primary.toUpperCase().replace(/\s+/g, '_');
  return PLAID_PRIMARY_TO_SLUG[key] ?? 'other';
}
