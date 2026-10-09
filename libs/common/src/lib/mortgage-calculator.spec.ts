import {
  calculateFuturePropertyValue,
  calculateMortgageAmortizationSchedule,
  getMortgageOutstandingBalance,
  getMortgagePaymentsDue,
  getMortgageTermsFromActivity
} from './mortgage-calculator';

describe('mortgage calculator', () => {
  const mortgage = {
    annualInterestRate: 6,
    principal: 300_000,
    startDate: new Date(2024, 0, 15),
    termYears: 15 as const
  };

  describe('calculateMortgageAmortizationSchedule', () => {
    it('splits each payment into interest and principal and pays off the balance', () => {
      const schedule = calculateMortgageAmortizationSchedule(mortgage);

      expect(schedule).toHaveLength(180);
      expect(schedule[0].date).toEqual(new Date(2024, 1, 15));
      expect(schedule[0].interest).toBe(1500);
      expect(schedule[0].principal).toBeGreaterThan(0);
      expect(schedule[0].payment).toBeCloseTo(
        schedule[0].interest + schedule[0].principal,
        2
      );
      expect(schedule[0].balance).toBe(
        mortgage.principal - schedule[0].principal
      );
      expect(schedule.at(-1)?.balance).toBe(0);
      expect(schedule.at(-1)?.principal).toBeGreaterThan(0);
    });

    it('supports a 30-year term and zero-interest loans', () => {
      const thirtyYearSchedule = calculateMortgageAmortizationSchedule({
        ...mortgage,
        termYears: 30
      });
      const zeroInterestSchedule = calculateMortgageAmortizationSchedule({
        ...mortgage,
        annualInterestRate: 0,
        termYears: 15
      });

      expect(thirtyYearSchedule).toHaveLength(360);
      expect(zeroInterestSchedule).toHaveLength(180);
      expect(zeroInterestSchedule[0].interest).toBe(0);
      expect(zeroInterestSchedule.at(-1)?.balance).toBe(0);
    });

    it('rejects invalid mortgage terms', () => {
      expect(() =>
        calculateMortgageAmortizationSchedule({
          ...mortgage,
          termYears: 20 as 15
        })
      ).toThrow('Mortgage term must be 15 or 30 years.');
      expect(() =>
        calculateMortgageAmortizationSchedule({ ...mortgage, principal: 0 })
      ).toThrow('Mortgage principal must be a positive number.');
    });
  });

  describe('getMortgagePaymentsDue', () => {
    it('returns only installments due by the requested date', () => {
      const duePayments = getMortgagePaymentsDue({
        ...mortgage,
        asOfDate: new Date(2024, 2, 15)
      });

      expect(duePayments).toHaveLength(2);
      expect(duePayments.map(({ date }) => date)).toEqual([
        new Date(2024, 1, 15),
        new Date(2024, 2, 15)
      ]);
      expect(
        duePayments.every(({ date }) => date <= new Date(2024, 2, 15))
      ).toBe(true);
    });

    it('does not return a payment before the first installment date', () => {
      expect(
        getMortgagePaymentsDue({ ...mortgage, asOfDate: mortgage.startDate })
      ).toEqual([]);
    });
  });

  describe('calculateFuturePropertyValue', () => {
    it('applies annual growth over a fractional number of years', () => {
      expect(
        calculateFuturePropertyValue({
          annualGrowthRate: 3,
          periodInMonths: 18,
          propertyValue: 500_000
        })
      ).toBe(522_667.92);
    });
  });

  describe('getMortgageTermsFromActivity', () => {
    it('reconstructs terms from a complete mortgage liability', () => {
      const terms = getMortgageTermsFromActivity({
        mortgageInterestRate: 6,
        mortgageStartDate: new Date(2024, 0, 15),
        mortgageTermYears: 30,
        quantity: 1,
        unitPrice: 300_000
      });

      expect(terms).toEqual({
        annualInterestRate: 6,
        principal: 300_000,
        startDate: new Date(2024, 0, 15),
        termYears: 30
      });
    });

    it.each([
      { field: 'mortgageInterestRate', value: undefined },
      { field: 'mortgageStartDate', value: undefined },
      { field: 'mortgageTermYears', value: undefined },
      { field: 'mortgageTermYears', value: 20 }
    ])(
      'returns null when $field is missing or invalid ($value)',
      ({ field, value }) => {
        expect(
          getMortgageTermsFromActivity({
            mortgageInterestRate: 6,
            mortgageStartDate: new Date(2024, 0, 15),
            mortgageTermYears: 30,
            quantity: 1,
            unitPrice: 300_000,
            [field]: value as never
          })
        ).toBeNull();
      }
    );
  });

  describe('getMortgageOutstandingBalance', () => {
    const mortgageTerms = {
      annualInterestRate: 6,
      principal: 300_000,
      startDate: new Date(2024, 0, 15),
      termYears: 15 as const
    };

    it('returns the full principal before the first installment', () => {
      expect(
        getMortgageOutstandingBalance(mortgageTerms, new Date(2024, 0, 31))
      ).toBe(300_000);
    });

    it('returns the balance after the installments due by the date', () => {
      const balance = getMortgageOutstandingBalance(
        mortgageTerms,
        new Date(2024, 2, 15)
      );

      expect(balance).toBeLessThan(300_000);
      expect(
        calculateMortgageAmortizationSchedule(mortgageTerms)[1].balance
      ).toBe(balance);
    });

    it('returns zero once the loan is fully amortized', () => {
      expect(
        getMortgageOutstandingBalance(mortgageTerms, new Date(2040, 0, 1))
      ).toBe(0);
    });
  });
});
