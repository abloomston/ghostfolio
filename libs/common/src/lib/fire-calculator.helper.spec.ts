import { FIRE_MAX_PROJECTION_YEARS } from '@ghostfolio/common/config';
import {
  calculateCompoundInterest,
  calculateFireProjection,
  calculatePeriodsToRetire,
  calculatePresentValue,
  getMonthsFromNow,
  toOneTimeSavings
} from '@ghostfolio/common/fire-calculator.helper';

describe('FireCalculatorHelper', () => {
  // A date in the middle of a month, so that the months of the year matter
  const asOf = new Date(2026, 0, 15);

  describe('Compound interest', () => {
    it('Gives the total amount of the payments without interest', () => {
      const { interest, principal, totalAmount } = calculateCompoundInterest({
        P: 1000,
        periodInMonths: 12,
        PMT: 100,
        r: 0
      });

      expect(interest.toNumber()).toEqual(0);
      expect(principal.toNumber()).toEqual(2200);
      expect(totalAmount.toNumber()).toEqual(2200);
    });

    it('Compounds the interest monthly', () => {
      const { totalAmount } = calculateCompoundInterest({
        P: 1000,
        periodInMonths: 12,
        PMT: 0,
        r: 0.12
      });

      expect(totalAmount.toNumber()).toBeCloseTo(1126.825030132, 8);
    });
  });

  describe('Present value', () => {
    it('Discounts an amount by the inflation of the period', () => {
      expect(
        calculatePresentValue({
          amount: 1000,
          expectedInflationRate: 0.02,
          periodInMonths: 120
        }).toNumber()
      ).toBeCloseTo(1000 / Math.pow(1.02, 10), 8);
    });
  });

  describe('Periods to retire', () => {
    it('Gives no period if the target amount is reached already', () => {
      expect(
        calculatePeriodsToRetire({
          P: 2000,
          PMT: 100,
          r: 0,
          totalAmount: 1000
        })
      ).toEqual(0);
    });

    it('Gives no end if neither the interest nor the payments grow', () => {
      expect(
        calculatePeriodsToRetire({
          P: 1000,
          PMT: 0,
          r: 0,
          totalAmount: 2000
        })
      ).toEqual(Infinity);
    });
  });

  describe('One-time savings', () => {
    it('Maps a date to the months from now', () => {
      expect(getMonthsFromNow({ asOf, date: new Date(2026, 6, 1) })).toEqual(6);
    });

    it('Gives no negative months', () => {
      expect(getMonthsFromNow({ asOf, date: new Date(2025, 11, 1) })).toEqual(
        0
      );
    });

    it('Removes a saving without an amount', () => {
      expect(
        toOneTimeSavings({
          asOf,
          savings: [{ amount: null }, { amount: 0 }, { amount: 1000 }]
        })
      ).toEqual([{ amount: 1000, monthsFromNow: 0 }]);
    });
  });

  describe('Projection', () => {
    it('Projects the amount of the retirement date', () => {
      const projection = calculateFireProjection({
        asOf,
        paymentPerPeriod: 1000,
        principalInvestmentAmount: 100000,
        retirementDate: new Date(2027, 0, 1),
        safeWithdrawalRateInPercentage: 4
      });

      expect(projection.assumptions).toEqual({
        expectedInflationRateInPercentage: 0,
        expectedReturnInPercentage: 0,
        oneTimeSavings: [],
        paymentPerPeriod: 1000,
        principalInvestmentAmount: 100000,
        safeWithdrawalRateInPercentage: 4
      });
      expect(projection.horizon).toEqual({
        isReachable: true,
        mode: 'retirement-date',
        monthsToRetire: 12,
        retirementDate: '2027-01-01',
        targetAmount: undefined,
        yearsToRetire: 1
      });
      expect(projection.atRetirement.amounts).toEqual({
        contributions: 12000,
        deposits: 100000,
        interest: 0,
        oneTimeSavings: 0,
        totalAmount: 112000
      });
      expect(projection.atRetirement.income).toEqual({
        perMonth: 373.33,
        perMonthInTodayDollars: 373.33,
        perYear: 4480,
        perYearInTodayDollars: 4480
      });
      expect(projection.incomeToday).toEqual({
        perMonth: 333.33,
        perYear: 4000
      });
      expect(projection.atRetirement.growthMultiple).toEqual(1.12);
    });

    it('Gives a row per year of the projection in today’s dollars', () => {
      const projection = calculateFireProjection({
        asOf,
        paymentPerPeriod: 1000,
        principalInvestmentAmount: 100000,
        retirementDate: new Date(2027, 0, 1)
      });

      expect(projection.years).toEqual([
        {
          contributions: 12000,
          deposits: 100000,
          interest: 0,
          monthsFromNow: 12,
          oneTimeSavings: 0,
          totalAmount: 112000,
          year: 2026
        },
        {
          contributions: 24000,
          deposits: 100000,
          interest: 0,
          monthsFromNow: 24,
          oneTimeSavings: 0,
          totalAmount: 124000,
          year: 2027
        }
      ]);
      expect(projection.yearsTruncated).toEqual(false);
    });

    it('Discounts the income of the retirement to today’s dollars', () => {
      const projection = calculateFireProjection({
        asOf,
        expectedInflationRateInPercentage: 100,
        expectedReturnInPercentage: 12,
        paymentPerPeriod: 0,
        principalInvestmentAmount: 1000,
        retirementDate: new Date(2027, 0, 1),
        safeWithdrawalRateInPercentage: 4
      });

      expect(projection.atRetirement.amounts?.totalAmount).toEqual(1126.83);
      expect(
        projection.atRetirement.amountsInTodayDollars?.totalAmount
      ).toEqual(563.41);
      expect(projection.atRetirement.income.perYear).toEqual(45.07);
      expect(projection.atRetirement.income.perYearInTodayDollars).toBeCloseTo(
        22.54,
        2
      );
    });

    it('Gives the time until the target amount is reached', () => {
      const projection = calculateFireProjection({
        asOf,
        paymentPerPeriod: 1000,
        principalInvestmentAmount: 0,
        targetAmount: 12000
      });

      expect(projection.horizon.mode).toEqual('target-amount');
      expect(projection.horizon.monthsToRetire).toEqual(12);
      expect(projection.horizon.retirementDate).toEqual('2027-01-01');
      expect(projection.horizon.yearsToRetire).toEqual(1);
      expect(projection.horizon.targetAmount).toEqual(12000);
      expect(projection.atRetirement.amounts?.totalAmount).toEqual(12000);
      expect(projection.atRetirement.growthMultiple).toEqual(null);
    });

    it('Counts a one-time saving from its month on', () => {
      const projection = calculateFireProjection({
        asOf,
        oneTimeSavings: [{ amount: 10000, date: new Date(2026, 6, 1) }],
        paymentPerPeriod: 0,
        principalInvestmentAmount: 0,
        targetAmount: 10000
      });

      expect(projection.horizon.monthsToRetire).toEqual(6);
      expect(projection.horizon.retirementDate).toEqual('2026-07-01');
      expect(projection.assumptions.oneTimeSavings).toEqual([
        { amount: 10000, monthsFromNow: 6 }
      ]);
      expect(projection.atRetirement.amounts).toEqual({
        contributions: 0,
        deposits: 0,
        interest: 0,
        oneTimeSavings: 10000,
        totalAmount: 10000
      });
    });

    it('Gives no projection if the target amount is unreachable', () => {
      const projection = calculateFireProjection({
        asOf,
        paymentPerPeriod: 0,
        principalInvestmentAmount: 1000,
        safeWithdrawalRateInPercentage: 4,
        targetAmount: 2000
      });

      expect(projection.horizon).toEqual({
        isReachable: false,
        mode: 'target-amount',
        monthsToRetire: null,
        retirementDate: null,
        targetAmount: 2000,
        yearsToRetire: null
      });
      expect(projection.atRetirement.amounts).toEqual(null);
      expect(projection.atRetirement.amountsInTodayDollars).toEqual(null);
      expect(projection.atRetirement.income).toEqual({
        perMonth: null,
        perMonthInTodayDollars: null,
        perYear: null,
        perYearInTodayDollars: null
      });
      expect(projection.years).toEqual([]);

      // The income of the investment amount today does not depend on the
      // horizon
      expect(projection.incomeToday).toEqual({
        perMonth: 3.33,
        perYear: 40
      });
    });

    it('Gives no income if the safe withdrawal rate is absent', () => {
      const projection = calculateFireProjection({
        asOf,
        monthsToRetire: 12,
        paymentPerPeriod: 0,
        principalInvestmentAmount: 1000
      });

      expect(projection.atRetirement.income).toEqual({
        perMonth: null,
        perMonthInTodayDollars: null,
        perYear: null,
        perYearInTodayDollars: null
      });
      expect(projection.incomeToday).toEqual({ perMonth: null, perYear: null });
    });

    it('Prefers the number of months over the target amount and the retirement date', () => {
      const projection = calculateFireProjection({
        asOf,
        monthsToRetire: 24,
        paymentPerPeriod: 1000,
        principalInvestmentAmount: 0,
        retirementDate: new Date(2030, 0, 1),
        targetAmount: 12000
      });

      expect(projection.horizon.mode).toEqual('months');
      expect(projection.horizon.monthsToRetire).toEqual(24);
      expect(projection.horizon.retirementDate).toEqual('2028-01-01');
    });

    it('Projects 10 years if no horizon is given', () => {
      const projection = calculateFireProjection({
        asOf,
        paymentPerPeriod: 0,
        principalInvestmentAmount: 1000
      });

      expect(projection.horizon.mode).toEqual('retirement-date');
      expect(projection.horizon.monthsToRetire).toEqual(120);
      expect(projection.horizon.retirementDate).toEqual('2036-01-01');
    });

    it('Retires now if the retirement date is in the past', () => {
      const projection = calculateFireProjection({
        asOf,
        paymentPerPeriod: 0,
        principalInvestmentAmount: 1000,
        retirementDate: new Date(2020, 0, 1)
      });

      expect(projection.horizon.monthsToRetire).toEqual(0);
      expect(projection.horizon.retirementDate).toEqual('2026-01-01');
      expect(projection.atRetirement.amounts?.totalAmount).toEqual(1000);
      expect(projection.years.length).toEqual(1);
    });

    it('Compounds a fraction of a month', () => {
      const projection = calculateFireProjection({
        asOf,
        expectedReturnInPercentage: 12,
        monthsToRetire: 12.5,
        paymentPerPeriod: 0,
        principalInvestmentAmount: 1000
      });

      // big.js has no fractional exponent, hence the fraction is compounded
      // with Math
      expect(projection.atRetirement.amounts?.totalAmount).toBeCloseTo(
        1000 * Math.pow(1.01, 12.5),
        1
      );
      expect(projection.horizon.monthsToRetire).toEqual(12.5);
      expect(projection.horizon.yearsToRetire).toEqual(1.04);
    });

    it('Reaches the target amount within the horizon', () => {
      const projection = calculateFireProjection({
        asOf,
        expectedInflationRateInPercentage: 2.5,
        expectedReturnInPercentage: 7,
        oneTimeSavings: [{ amount: 50000, date: new Date(2029, 5, 1) }],
        paymentPerPeriod: 2000,
        principalInvestmentAmount: 500000,
        safeWithdrawalRateInPercentage: 4,
        targetAmount: 2000000
      });

      expect(projection.horizon.isReachable).toEqual(true);
      expect(projection.atRetirement.amounts?.totalAmount).toEqual(2000000);
      expect(projection.atRetirement.income.perYear).toEqual(80000);
      expect(
        projection.atRetirement.amountsInTodayDollars?.totalAmount
      ).toBeLessThan(2000000);
      expect(projection.atRetirement.income.perYearInTodayDollars).toBeLessThan(
        80000
      );
      const { amounts } = projection.atRetirement;

      expect(
        (amounts?.deposits ?? 0) +
          (amounts?.contributions ?? 0) +
          (amounts?.oneTimeSavings ?? 0) +
          (amounts?.interest ?? 0)
      ).toBeCloseTo(2000000, 1);
    });

    it('Counts no saving which comes after the horizon', () => {
      const projection = calculateFireProjection({
        asOf,
        monthsToRetire: 12,
        oneTimeSavings: [{ amount: 50000, date: new Date(2029, 5, 1) }],
        paymentPerPeriod: 0,
        principalInvestmentAmount: 1000
      });

      expect(projection.atRetirement.amounts).toEqual({
        contributions: 0,
        deposits: 1000,
        interest: 0,
        oneTimeSavings: 0,
        totalAmount: 1000
      });
    });

    it(`Truncates the years after ${FIRE_MAX_PROJECTION_YEARS} years`, () => {
      const projection = calculateFireProjection({
        asOf,
        paymentPerPeriod: 1,
        principalInvestmentAmount: 0,
        targetAmount: 2400
      });

      expect(projection.horizon.yearsToRetire).toEqual(200);
      expect(projection.years.length).toEqual(FIRE_MAX_PROJECTION_YEARS);
      expect(projection.yearsTruncated).toEqual(true);
    });
  });
});
