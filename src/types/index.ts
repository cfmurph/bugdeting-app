export interface Budget {
    totalIncome: number;
    totalExpenses: number;
    calculateBalance(): number;
    addExpense(amount: number, description: string, date: Date): void;
}

export interface Expense {
    amount: number;
    description: string;
    date: Date;
    getExpenseDetails(): string;
}

export interface Income {
    amount: number;
    source: string;
    date: Date;
    getIncomeDetails(): string;
}