export function calculateTotalIncome(incomes: { amount: number }[]): number {
    return incomes.reduce((total, income) => total + income.amount, 0);
}

export function calculateTotalExpenses(expenses: { amount: number }[]): number {
    return expenses.reduce((total, expense) => total + expense.amount, 0);
}

export function calculateBalance(totalIncome: number, totalExpenses: number): number {
    return totalIncome - totalExpenses;
}