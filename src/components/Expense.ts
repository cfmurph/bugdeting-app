class Expense {
    amount: number;
    description: string;
    date: Date;

    constructor(amount: number, description: string, date: Date) {
        this.amount = amount;
        this.description = description;
        this.date = date;
    }

    getExpenseDetails(): string {
        return `Expense: ${this.description}, Amount: $${this.amount}, Date: ${this.date.toDateString()}`;
    }
}

export default Expense;