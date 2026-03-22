export class Income {
    amount: number;
    source: string;
    date: Date;

    constructor(amount: number, source: string, date: Date) {
        this.amount = amount;
        this.source = source;
        this.date = date;
    }

    getIncomeDetails() {
        return {
            amount: this.amount,
            source: this.source,
            date: this.date,
        };
    }
}