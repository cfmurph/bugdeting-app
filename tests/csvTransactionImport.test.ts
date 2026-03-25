import { parseCsvTransactionBuffer } from '../src/utils/csvTransactionImport';

function buf(s: string): Buffer {
  return Buffer.from(s, 'utf8');
}

describe('parseCsvTransactionBuffer', () => {
  test('parses valid CSV with header and two rows', () => {
    const csv = `date,description,amount,type
2024-01-15,Groceries,45.67,expense
2024-01-16,Salary,1000,income
`;
    const { rows, errors } = parseCsvTransactionBuffer(buf(csv));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: '2024-01-15',
      description: 'Groceries',
      amountDollars: 45.67,
      type: 'expense',
      line: 2,
    });
    expect(rows[1]).toMatchObject({
      date: '2024-01-16',
      description: 'Salary',
      amountDollars: 1000,
      type: 'income',
      line: 3,
    });
  });

  test('header columns are case-insensitive', () => {
    const csv = `Date,DESCRIPTION,Amount,Type
2024-02-01,Test,10,expense
`;
    const { rows, errors } = parseCsvTransactionBuffer(buf(csv));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  test('quoted description with commas', () => {
    const csv = `date,description,amount,type
2024-03-01,"Store, Inc.",12.50,expense
`;
    const { rows, errors } = parseCsvTransactionBuffer(buf(csv));
    expect(errors).toEqual([]);
    expect(rows[0].description).toBe('Store, Inc.');
  });

  test('errors on missing header column', () => {
    const csv = `date,description,amount
2024-01-01,x,1
`;
    const { rows, errors } = parseCsvTransactionBuffer(buf(csv));
    expect(rows).toEqual([]);
    expect(errors.some((e) => e.line === 1 && e.message.includes('Header must include'))).toBe(true);
  });

  test('collects per-row errors and still returns valid rows', () => {
    const csv = `date,description,amount,type
2024-01-01,Good,10,expense
bad-date,Bad,10,expense
2024-01-03,Also good,5,income
`;
    const { rows, errors } = parseCsvTransactionBuffer(buf(csv));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
    expect(errors.some((e) => e.line === 3)).toBe(true);
  });

  test('amount may include thousands separator', () => {
    const csv = `date,description,amount,type
2024-01-01,Bonus,"1,234.56",income
`;
    const { rows, errors } = parseCsvTransactionBuffer(buf(csv));
    expect(errors).toEqual([]);
    expect(rows[0].amountDollars).toBe(1234.56);
  });
});
