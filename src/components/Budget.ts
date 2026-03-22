class Budget {
    totalIncome: number;
    totalExpenses: number;

    constructor() {
        this.totalIncome = 0;
        this.totalExpenses = 0;
    }

    calculateBalance(): number {
        return this.totalIncome - this.totalExpenses;
    }

    addExpense(amount: number): void {
        this.totalExpenses += amount;
    }

    addIncome(amount: number): void {
        this.totalIncome += amount;
    }
}

export default Budget;