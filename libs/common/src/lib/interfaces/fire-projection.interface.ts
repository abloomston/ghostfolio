import { FireOneTimeSaving } from './fire-one-time-saving.interface';

/**
 * Result of a projection of the FIRE calculator
 */
export interface FireProjection {
  assumptions: {
    expectedInflationRateInPercentage: number;
    expectedReturnInPercentage: number;
    oneTimeSavings: FireOneTimeSaving[];
    paymentPerPeriod: number;
    principalInvestmentAmount: number;
    safeWithdrawalRateInPercentage?: number;
  };
  atRetirement: {
    // Amounts of the future value, null if the target amount is unreachable
    amounts: FireProjectionAmounts | null;
    // Amounts of the future value in today's dollars
    amountsInTodayDollars: FireProjectionAmounts | null;
    // Factor the investment amount grows to, null if it is not greater than 0
    growthMultiple: number | null;
    income: {
      perMonth: number | null;
      perMonthInTodayDollars: number | null;
      perYear: number | null;
      perYearInTodayDollars: number | null;
    };
  };
  horizon: {
    isReachable: boolean;

    // Which parameter has given the horizon
    mode: 'months' | 'retirement-date' | 'target-amount';

    // Number of months until retirement, rounded to two decimals
    monthsToRetire: number | null;

    // First day of the month of the retirement date
    retirementDate: string | null;
    targetAmount?: number;

    // Number of years until retirement, rounded to two decimals
    yearsToRetire: number | null;
  };

  // Income of the safe withdrawal rate applied to the investment amount today
  incomeToday: { perMonth: number | null; perYear: number | null };

  // One row per year of the projection, in today's dollars
  years: FireProjectionYear[];
  yearsTruncated: boolean;
}

export interface FireProjectionAmounts {
  contributions: number | null;
  deposits: number | null;
  interest: number | null;
  oneTimeSavings: number | null;
  totalAmount: number | null;
}

export interface FireProjectionYear {
  contributions: number | null;
  deposits: number | null;
  interest: number | null;
  monthsFromNow: number;
  oneTimeSavings: number | null;
  totalAmount: number | null;
  year: number;
}
