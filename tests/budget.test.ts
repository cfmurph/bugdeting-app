import Budget from '../src/components/Budget';

describe('Budget Component', () => {
    let budget: Budget;

    beforeEach(() => {
        budget = new Budget();
    });

    test('should initialize with zero income and expenses', () => {
        expect(budget.totalIncome).toBe(0);
        expect(budget.totalExpenses).toBe(0);
    });

    test('should calculate balance correctly', () => {
        budget.totalIncome = 1000;
        budget.totalExpenses = 500;
        expect(budget.calculateBalance()).toBe(500);
    });

    test('should add expense correctly', () => {
        budget.addExpense(200);
        expect(budget.totalExpenses).toBe(200);
    });

    test('should calculate balance after adding expense', () => {
        budget.totalIncome = 1000;
        budget.addExpense(300);
        expect(budget.calculateBalance()).toBe(700);
    });
});