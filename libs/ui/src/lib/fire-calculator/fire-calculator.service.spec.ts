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
