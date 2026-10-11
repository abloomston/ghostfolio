import { Test, TestingModule } from '@nestjs/testing';

import { FireCalculatorService } from './fire-calculator.service';

describe('FireCalculatorService', () => {
  let fireCalculatorService: FireCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FireCalculatorService]
    }).compile();

    fireCalculatorService = module.get<FireCalculatorService>(
      FireCalculatorService
    );
  });

  describe('Historical portfolio returns', () => {
    it('should calculate annualized returns from historical prices', () => {
      const asOf = new Date('2025-01-01T00:00:00.000Z');
      const periodInDays =
        (asOf.getTime() - new Date('2020-01-01T00:00:00.000Z').getTime()) /
        (24 * 60 * 60 * 1000);
      const currentPrice = 100 * Math.pow(1.08, periodInDays / 365.25);

      const annualizedReturn =
        fireCalculatorService.calculateAnnualizedReturnFromHistory({
          asOf,
          currentPrice,
          history: [
            { date: '2020-01-01T00:00:00.000Z', marketPrice: 100 },
            { date: '2022-01-01T00:00:00.000Z', marketPrice: 120 }
          ],
          years: 5
        });

      expect(annualizedReturn).toBeCloseTo(8, 10);
    });

    it('should return no estimate when the history does not cover the requested period', () => {
      const annualizedReturn =
        fireCalculatorService.calculateAnnualizedReturnFromHistory({
          asOf: new Date('2025-01-01T00:00:00.000Z'),
          currentPrice: 120,
          history: [{ date: '2021-01-01T00:00:00.000Z', marketPrice: 100 }],
          years: 5
        });

      expect(annualizedReturn).toBeUndefined();
    });

    it('should weight asset returns by their share of the portfolio', () => {
      const annualizedReturn =
        fireCalculatorService.calculateWeightedPortfolioReturn([
          { value: 60, annualizedReturn: 8 },
          { value: 30, annualizedReturn: 2 },
          { value: 10, annualizedReturn: 4 }
        ]);

      expect(annualizedReturn).toBeCloseTo(5.8, 10);
    });

    it('should ignore zero-value assets when calculating the weighted return', () => {
      const annualizedReturn =
        fireCalculatorService.calculateWeightedPortfolioReturn([
          { value: 100, annualizedReturn: 5 },
          { value: 0, annualizedReturn: undefined }
        ]);

      expect(annualizedReturn).toBe(5);
    });

    it('should not suggest a portfolio return when a holding has no historical return', () => {
      const annualizedReturn =
        fireCalculatorService.calculateWeightedPortfolioReturn([
          { value: 75, annualizedReturn: 8 },
          { value: 25, annualizedReturn: undefined }
        ]);

      expect(annualizedReturn).toBeUndefined();
    });
  });

  describe('Present value', () => {
    it('should deflate a future amount by the expected inflation rate', () => {
      const futureAmount = fireCalculatorService.calculateCompoundInterest({
        P: 1000,
        periodInMonths: 12,
        PMT: 0,
        r: 0.05
      }).totalAmount;

      const presentAmount = fireCalculatorService.calculatePresentValue({
        amount: futureAmount.toNumber(),
        expectedInflationRate: 0.025,
        periodInMonths: 12
      });

      expect(presentAmount.toNumber()).toBeCloseTo(1025.52, 2);
    });

    it('should leave amounts unchanged when expected inflation is zero', () => {
      const presentAmount = fireCalculatorService.calculatePresentValue({
        amount: 1000,
        expectedInflationRate: 0,
        periodInMonths: 120
      });

      expect(presentAmount.toNumber()).toBe(1000);
    });

    it('should support fractional-year inflation periods', () => {
      const presentAmount = fireCalculatorService.calculatePresentValue({
        amount: 100,
        expectedInflationRate: 0.1,
        periodInMonths: 6
      });

      expect(presentAmount.toNumber()).toBeCloseTo(100 / Math.sqrt(1.1), 10);
    });
  });

  describe('One-time savings', () => {
    const today = new Date(2025, 0, 15);

    it('should add a lump sum of the current month right now', () => {
      const oneTimeSavings = fireCalculatorService.toOneTimeSavings({
        asOf: today,
        savings: [{ amount: 50000, date: new Date(2025, 0, 20) }]
      });

      expect(oneTimeSavings).toEqual([{ amount: 50000, monthsFromNow: 0 }]);
    });

    it('should map a future date to the months from today', () => {
      const oneTimeSavings = fireCalculatorService.toOneTimeSavings({
        asOf: today,
        savings: [{ amount: 50000, date: new Date(2025, 3, 1) }]
      });

      expect(oneTimeSavings).toEqual([{ amount: 50000, monthsFromNow: 3 }]);
    });

    it('should clamp dates in the past to right now and ignore empty amounts', () => {
      const oneTimeSavings = fireCalculatorService.toOneTimeSavings({
        asOf: today,
        savings: [
          { amount: 50000, date: new Date(2024, 0, 1) },
          { amount: 25000, date: null },
          { amount: null, date: new Date(2025, 1, 1) },
          { amount: 0, date: new Date(2025, 2, 1) },
          { amount: -100, date: new Date(2025, 2, 1) }
        ]
      });

      expect(oneTimeSavings).toEqual([
        { amount: 50000, monthsFromNow: 0 },
        { amount: 25000, monthsFromNow: 0 }
      ]);
    });

    it('should count a lump sum dated today in the principal', () => {
      const { interest, principal, totalAmount } =
        fireCalculatorService.calculateCompoundInterest({
          P: 10000,
          oneTimeSavings: [{ amount: 5000, monthsFromNow: 0 }],
          periodInMonths: 0,
          PMT: 1000,
          r: 0
        });

      expect(principal.toNumber()).toBe(15000);
      expect(interest.toNumber()).toBe(0);
      expect(totalAmount.toNumber()).toBe(15000);
    });

    it('should let a lump sum compound from the month it is contributed', () => {
      const { interest, principal, totalAmount } =
        fireCalculatorService.calculateCompoundInterest({
          P: 0,
          oneTimeSavings: [{ amount: 1000, monthsFromNow: 12 }],
          periodInMonths: 24,
          PMT: 0,
          r: 0.12
        });

      // Half of the period at a monthly interest rate of 1%
      expect(totalAmount.toNumber()).toBeCloseTo(1000 * 1.01 ** 12, 8);
      expect(principal.toNumber()).toBe(1000);
      expect(interest.toNumber()).toBeCloseTo(1000 * 1.01 ** 12 - 1000, 8);
    });

    it('should not count a lump sum that is contributed later', () => {
      const { interest, principal, totalAmount } =
        fireCalculatorService.calculateCompoundInterest({
          P: 0,
          oneTimeSavings: [{ amount: 1000, monthsFromNow: 24 }],
          periodInMonths: 12,
          PMT: 0,
          r: 0.12
        });

      expect(totalAmount.toNumber()).toBe(0);
      expect(principal.toNumber()).toBe(0);
      expect(interest.toNumber()).toBe(0);
    });

    it('should keep the total amount equal to principal plus interest', () => {
      const { interest, principal, totalAmount } =
        fireCalculatorService.calculateCompoundInterest({
          P: 10000,
          oneTimeSavings: [
            { amount: 5000, monthsFromNow: 0 },
            { amount: 2000, monthsFromNow: 6 }
          ],
          periodInMonths: 18,
          PMT: 500,
          r: 0.05
        });

      expect(totalAmount.toNumber()).toBeCloseTo(
        principal.plus(interest).toNumber(),
        8
      );
      expect(principal.toNumber()).toBe(10000 + 500 * 18 + 5000 + 2000);
    });

    it('should calculate the value of the lump sums contributed so far', () => {
      const { principal, totalAmount } =
        fireCalculatorService.calculateOneTimeSavings({
          oneTimeSavings: [
            { amount: 5000, monthsFromNow: 0 },
            { amount: 2000, monthsFromNow: 12 }
          ],
          periodInMonths: 12,
          r: 0.12
        });

      expect(principal.toNumber()).toBe(7000);
      expect(totalAmount.toNumber()).toBeCloseTo(5000 * 1.01 ** 12 + 2000, 8);
    });

    it('should retire right now with a lump sum added today', () => {
      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        P: 0,
        oneTimeSavings: [{ amount: 100000, monthsFromNow: 0 }],
        PMT: 0,
        r: 0.05,
        totalAmount: 100000
      });

      expect(periodsToRetire).toBe(0);
    });

    it('should shorten the periods to retire with a lump sum added today', () => {
      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        P: 1000,
        oneTimeSavings: [{ amount: 900, monthsFromNow: 0 }],
        PMT: 100,
        r: 0,
        totalAmount: 1900
      });

      expect(periodsToRetire).toBe(0);
    });

    it('should return the periods without one-time savings if none are contributed', () => {
      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        P: 1000,
        oneTimeSavings: [],
        PMT: 100,
        r: 0,
        totalAmount: 1900
      });

      expect(periodsToRetire).toBe(9);
    });

    it('should not reach the target before a future lump sum is contributed', () => {
      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        P: 1000,
        oneTimeSavings: [{ amount: 500, monthsFromNow: 6 }],
        PMT: 100,
        r: 0,
        totalAmount: 2000
      });

      expect(periodsToRetire).toBe(6);
    });

    it('should solve the periods to retire within the compound interest formula', () => {
      const oneTimeSavings = [
        { amount: 20000, monthsFromNow: 0 },
        { amount: 10000, monthsFromNow: 6 }
      ];
      const totalAmount = 812399.66;
      const parameters = {
        PMT: 6000,
        r: 0.05,
        totalAmount
      };

      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        ...parameters,
        P: 598478.96,
        oneTimeSavings
      });

      const periodsWithoutOneTimeSavings =
        fireCalculatorService.calculatePeriodsToRetire({
          ...parameters,
          P: 598478.96
        });

      expect(periodsToRetire).toBeLessThan(periodsWithoutOneTimeSavings);
      expect(Math.round(periodsToRetire)).toBe(21);

      // The projected amount brackets the target around the retirement month
      const amountAt = (periodInMonths: number) =>
        fireCalculatorService
          .calculateCompoundInterest({
            ...parameters,
            P: 598478.96,
            oneTimeSavings,
            periodInMonths
          })
          .totalAmount.toNumber();

      expect(amountAt(Math.floor(periodsToRetire))).toBeLessThan(totalAmount);
      expect(amountAt(Math.ceil(periodsToRetire))).toBeGreaterThanOrEqual(
        totalAmount
      );
    });

    it('should never retire before the lump sum that makes it possible', () => {
      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        P: 0,
        oneTimeSavings: [{ amount: 100000, monthsFromNow: 12 }],
        PMT: 0,
        r: 0,
        totalAmount: 100000
      });

      expect(periodsToRetire).toBe(12);
    });

    it('should not retire if a lump sum is not enough and nothing is saved', () => {
      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        P: 1000,
        oneTimeSavings: [{ amount: 500, monthsFromNow: 6 }],
        PMT: 0,
        r: 0,
        totalAmount: 100000
      });

      expect(periodsToRetire).toBe(Infinity);
    });

    it('should treat the current month as right now', () => {
      expect(
        fireCalculatorService.getMonthsFromNow({
          asOf: today,
          date: new Date(2025, 0, 31)
        })
      ).toBe(0);

      expect(
        fireCalculatorService.getMonthsFromNow({
          asOf: today,
          date: new Date(2026, 0, 1)
        })
      ).toBe(12);

      expect(
        fireCalculatorService.getMonthsFromNow({ asOf: today, date: null })
      ).toBe(0);
    });
  });

  describe('Test periods to retire', () => {
    it('should return the correct amount of periods to retire with no interst rate', async () => {
      const r = 0;
      const P = 1000;
      const totalAmount = 1900;
      const PMT = 100;

      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        P,
        r,
        PMT,
        totalAmount
      });

      expect(periodsToRetire).toBe(9);
    });

    it('should return the 0 when total amount is 0', async () => {
      const r = 0.05;
      const P = 100000;
      const totalAmount = 0;
      const PMT = 10000;

      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        P,
        r,
        PMT,
        totalAmount
      });

      expect(periodsToRetire).toBe(0);
    });

    it('should return the correct amount of periods to retire with interst rate', async () => {
      const r = 0.05;
      const P = 598478.96;
      const totalAmount = 812399.66;
      const PMT = 6000;
      const expectedPeriods = 24;

      const periodsToRetire = fireCalculatorService.calculatePeriodsToRetire({
        P,
        r,
        PMT,
        totalAmount
      });

      expect(Math.round(periodsToRetire)).toBe(expectedPeriods);
    });
  });
});
