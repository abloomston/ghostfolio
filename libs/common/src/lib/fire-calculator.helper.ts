import {
  FireOneTimeSaving,
  FireProjection,
  FireProjectionAmounts,
  FireProjectionYear,
  HistoricalDataItem
} from '@ghostfolio/common/interfaces';

import { Big } from 'big.js';
import {
  addMonths,
  differenceInMonths,
  format,
  max,
  startOfMonth,
  subYears
} from 'date-fns';

import {
  FIRE_DEFAULT_PROJECTION_YEARS,
  FIRE_MAX_PROJECTION_YEARS
} from './config';
import { DATE_FORMAT } from './helper';

/**
 * Number of times the interest is compounded per year, which is also the
 * number of the payments per year
 */
const COMPOUND_PERIOD = 12;

interface FireProjectionHorizon {
  dateOfRetirementDate: Date | null;
  isReachable: boolean;
  mode: 'months' | 'retirement-date' | 'target-amount';
  monthsToRetire: number | null;
  targetAmount?: number;
}

export function calculateAnnualizedReturnFromHistory({
  asOf = new Date(),
  currentPrice,
  history,
  years
}: {
  asOf?: Date;
  currentPrice: number;
  history: Pick<HistoricalDataItem, 'date' | 'marketPrice'>[];
  years: number;
}): number | undefined {
  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isInteger(years) ||
    years <= 0
  ) {
    return undefined;
  }

  const cutoff = subYears(asOf, years);
  const historicalPrice = history
    .filter(({ date, marketPrice }) => {
      return (
        marketPrice !== undefined &&
        Number.isFinite(marketPrice) &&
        marketPrice > 0 &&
        new Date(date).getTime() <= cutoff.getTime()
      );
    })
    .sort((first, second) => {
      return new Date(first.date).getTime() - new Date(second.date).getTime();
    })
    .at(-1);

  if (!historicalPrice?.marketPrice) {
    return undefined;
  }

  const periodInDays =
    (asOf.getTime() - new Date(historicalPrice.date).getTime()) /
    (24 * 60 * 60 * 1000);

  if (periodInDays <= 0) {
    return undefined;
  }

  const annualizedReturn =
    (Math.pow(
      currentPrice / historicalPrice.marketPrice,
      365.25 / periodInDays
    ) -
      1) *
    100;

  return Number.isFinite(annualizedReturn) ? annualizedReturn : undefined;
}

export function calculateWeightedPortfolioReturn(
  assets: { annualizedReturn?: number; value: number }[]
): number | undefined {
  if (assets.some(({ value }) => !Number.isFinite(value) || value < 0)) {
    return undefined;
  }

  const contributingAssets = assets.filter(({ value }) => value > 0);

  if (
    contributingAssets.length === 0 ||
    contributingAssets.some(
      ({ annualizedReturn, value }) =>
        !Number.isFinite(value) ||
        annualizedReturn === undefined ||
        !Number.isFinite(annualizedReturn)
    )
  ) {
    return undefined;
  }

  const totalValue = contributingAssets.reduce((sum, asset) => {
    return sum + asset.value;
  }, 0);

  return contributingAssets.reduce((sum, asset) => {
    return sum + (asset.value / totalValue) * (asset.annualizedReturn ?? 0);
  }, 0);
}

export function calculateCompoundInterest({
  P,
  oneTimeSavings = [],
  periodInMonths,
  PMT,
  r
}: {
  P: number;
  oneTimeSavings?: FireOneTimeSaving[];
  periodInMonths: number;
  PMT: number;
  r: number;
}) {
  const {
    principal: oneTimeSavingsPrincipal,
    totalAmount: oneTimeSavingsTotalAmount
  } = calculateOneTimeSavings({ oneTimeSavings, periodInMonths, r });

  let interest = new Big(0);
  const principal = new Big(P)
    .plus(new Big(PMT).mul(periodInMonths))
    .plus(oneTimeSavingsPrincipal);
  let totalAmount = principal;

  if (r) {
    // big.js raises to an integer exponent only, hence a fraction of a month,
    // which the periods to retire can be, is compounded with Math
    const compoundInterestForPrincipal = new Big(1).plus(
      new Big(r).div(COMPOUND_PERIOD)
    );
    const growthFactor = Number.isInteger(periodInMonths)
      ? compoundInterestForPrincipal.pow(periodInMonths)
      : new Big(
          Math.pow(compoundInterestForPrincipal.toNumber(), periodInMonths)
        );

    const compoundInterest = new Big(P).mul(growthFactor);
    const contributionInterest = new Big(
      new Big(PMT).mul(growthFactor.minus(1))
    ).div(new Big(r).div(COMPOUND_PERIOD));

    totalAmount = compoundInterest
      .plus(contributionInterest)
      .plus(oneTimeSavingsTotalAmount);
    interest = totalAmount.minus(principal);
  }

  return {
    interest,
    principal,
    totalAmount
  };
}

/**
 * Value of the one-time savings (lump sums) contributed up to
 * `periodInMonths`, given as principal (deposited) and total amount
 * (including the interest they earned).
 */
export function calculateOneTimeSavings({
  oneTimeSavings = [],
  periodInMonths,
  r
}: {
  oneTimeSavings?: FireOneTimeSaving[];
  periodInMonths: number;
  r: number;
}) {
  const periodInterest = r / COMPOUND_PERIOD;

  return getOneTimeSavings(oneTimeSavings).reduce(
    (result, { amount, monthsFromNow }) => {
      if (monthsFromNow > periodInMonths) {
        return result;
      }

      return {
        principal: result.principal.plus(amount),
        totalAmount: result.totalAmount.plus(
          amount * Math.pow(1 + periodInterest, periodInMonths - monthsFromNow)
        )
      };
    },
    { principal: new Big(0), totalAmount: new Big(0) }
  );
}

/**
 * Number of months from today a date is away, 0 for the current month, so
 * that a saving added in the current month counts right now.
 */
export function getMonthsFromNow({
  asOf = new Date(),
  date
}: {
  asOf?: Date;
  date?: Date | null;
}): number {
  if (
    date === null ||
    date === undefined ||
    Number.isNaN(new Date(date).getTime())
  ) {
    return 0;
  }

  return Math.max(
    0,
    differenceInMonths(startOfMonth(new Date(date)), startOfMonth(asOf))
  );
}

/**
 * Maps the one-time savings of the calculator form to the periods used by
 * the calculations, where `monthsFromNow` is 0 for a saving added right now.
 */
export function toOneTimeSavings({
  asOf = new Date(),
  savings
}: {
  asOf?: Date;
  savings: { amount?: number | null; date?: Date | null }[];
}): FireOneTimeSaving[] {
  return getOneTimeSavings(
    (savings ?? []).map(({ amount, date }) => {
      return {
        amount: Number(amount),
        monthsFromNow: getMonthsFromNow({ asOf, date })
      };
    })
  );
}

export function calculatePresentValue({
  amount,
  expectedInflationRate,
  periodInMonths
}: {
  amount: number;
  expectedInflationRate: number;
  periodInMonths: number;
}) {
  const inflationFactor = Math.pow(
    1 + expectedInflationRate,
    periodInMonths / COMPOUND_PERIOD
  );

  return new Big(amount).div(inflationFactor);
}

export function calculatePeriodsToRetire({
  P,
  oneTimeSavings = [],
  PMT,
  r,
  totalAmount
}: {
  P: number;
  oneTimeSavings?: FireOneTimeSaving[];
  PMT: number;
  r: number;
  totalAmount: number;
}) {
  const relevantOneTimeSavings = getOneTimeSavings(oneTimeSavings);

  if (relevantOneTimeSavings.length === 0) {
    return calculatePeriodsWithoutOneTimeSavings({
      P,
      PMT,
      r,
      totalAmount
    });
  }

  const getAmountAt = (periodInMonths: number) =>
    calculateCompoundInterest({
      P,
      oneTimeSavings: relevantOneTimeSavings,
      periodInMonths,
      PMT,
      r
    }).totalAmount.toNumber();

  let period = 0;
  let amount = getAmountAt(0);

  if (amount >= totalAmount) {
    return 0;
  }

  // Walk the periods between the months the savings are contributed. Within
  // a period the compound interest formula applies unchanged.
  const monthsOfOneTimeSavings = [
    ...new Set(relevantOneTimeSavings.map(({ monthsFromNow }) => monthsFromNow))
  ].sort((first, second) => first - second);

  for (const monthOfOneTimeSaving of monthsOfOneTimeSavings) {
    if (monthOfOneTimeSaving > period) {
      const periodsToRetire = calculatePeriodsWithoutOneTimeSavings({
        P: amount,
        PMT,
        r,
        totalAmount
      });

      if (
        Number.isFinite(periodsToRetire) &&
        period + periodsToRetire < monthOfOneTimeSaving
      ) {
        return period + periodsToRetire;
      }

      period = monthOfOneTimeSaving;
    }

    amount = getAmountAt(monthOfOneTimeSaving);

    // A lump sum can retire the portfolio right away
    if (amount >= totalAmount) {
      return monthOfOneTimeSaving;
    }
  }

  return (
    period +
    calculatePeriodsWithoutOneTimeSavings({
      P: amount,
      PMT,
      r,
      totalAmount
    })
  );
}

/**
 * Projection of the FIRE calculator: either the time until the target amount
 * is reached or the value of the portfolio at the retirement date, how the
 * amount is composed and which income the safe withdrawal rate gives at
 * retirement. Every amount is given in the currency of the inputs, in future
 * dollars as well as in today's dollars.
 */
export function calculateFireProjection({
  asOf = new Date(),
  expectedInflationRateInPercentage = 0,
  expectedReturnInPercentage = 0,
  monthsToRetire,
  oneTimeSavings = [],
  paymentPerPeriod,
  principalInvestmentAmount,
  retirementDate,
  safeWithdrawalRateInPercentage,
  targetAmount
}: {
  asOf?: Date;
  expectedInflationRateInPercentage?: number;
  expectedReturnInPercentage?: number;
  monthsToRetire?: number;
  oneTimeSavings?: { amount?: number | null; date?: Date | null }[];
  paymentPerPeriod: number;
  principalInvestmentAmount: number;
  retirementDate?: Date | null;
  safeWithdrawalRateInPercentage?: number;
  targetAmount?: number;
}): FireProjection {
  // Annual interest rate
  const r = expectedReturnInPercentage / 100;

  const expectedInflationRate = expectedInflationRateInPercentage / 100;

  const safeWithdrawalRateInPercentageOfInput = toNumber(
    safeWithdrawalRateInPercentage
  );

  const safeWithdrawalRate =
    safeWithdrawalRateInPercentageOfInput === undefined
      ? undefined
      : safeWithdrawalRateInPercentageOfInput / 100;

  const savings = toOneTimeSavings({ asOf, savings: oneTimeSavings });

  const horizon = getFireProjectionHorizon({
    asOf,
    monthsToRetire,
    oneTimeSavings: savings,
    paymentPerPeriod,
    principalInvestmentAmount,
    r,
    retirementDate,
    targetAmount
  });

  const incomeOfToday =
    safeWithdrawalRate === undefined
      ? { perMonth: null, perYear: null }
      : {
          perMonth: round(
            (principalInvestmentAmount * safeWithdrawalRate) / COMPOUND_PERIOD
          ),
          perYear: round(principalInvestmentAmount * safeWithdrawalRate)
        };

  const assumptions = {
    expectedInflationRateInPercentage,
    expectedReturnInPercentage,
    oneTimeSavings: savings.map(({ amount, monthsFromNow }) => {
      return { amount: round(amount) ?? 0, monthsFromNow };
    }),
    paymentPerPeriod,
    principalInvestmentAmount,
    safeWithdrawalRateInPercentage: safeWithdrawalRateInPercentageOfInput
  };

  const {
    dateOfRetirementDate,
    isReachable,
    mode,
    monthsToRetire: months
  } = horizon;

  const yearsToRetire =
    months === null ? null : round(months / COMPOUND_PERIOD);

  if (months === null || dateOfRetirementDate === null) {
    return {
      assumptions,
      atRetirement: {
        amounts: null,
        amountsInTodayDollars: null,
        growthMultiple: null,
        income: {
          perMonth: null,
          perMonthInTodayDollars: null,
          perYear: null,
          perYearInTodayDollars: null
        }
      },
      horizon: {
        isReachable,
        mode,
        monthsToRetire: null,
        retirementDate: null,
        targetAmount: horizon.targetAmount,
        yearsToRetire: null
      },
      incomeToday: incomeOfToday,
      years: [],
      yearsTruncated: false
    };
  }

  const { interest, totalAmount } = calculateCompoundInterest({
    P: principalInvestmentAmount,
    oneTimeSavings: savings,
    periodInMonths: months,
    PMT: paymentPerPeriod,
    r
  });

  const contributions = paymentPerPeriod * months;

  const oneTimeSavingsOfPeriod = calculateOneTimeSavings({
    oneTimeSavings: savings,
    periodInMonths: months,
    r
  });

  const getPresentValue = (amount: number) =>
    round(
      calculatePresentValue({
        amount,
        expectedInflationRate,
        periodInMonths: months
      }).toNumber()
    );

  const amounts: FireProjectionAmounts = {
    contributions: round(contributions),
    deposits: round(principalInvestmentAmount),
    interest: round(interest.toNumber()),
    oneTimeSavings: round(oneTimeSavingsOfPeriod.principal.toNumber()),
    totalAmount: round(totalAmount.toNumber())
  };

  const amountsInTodayDollars: FireProjectionAmounts = {
    contributions: getPresentValue(contributions),
    deposits: getPresentValue(principalInvestmentAmount),
    interest: getPresentValue(interest.toNumber()),
    oneTimeSavings: getPresentValue(
      oneTimeSavingsOfPeriod.principal.toNumber()
    ),
    totalAmount: getPresentValue(totalAmount.toNumber())
  };

  return {
    assumptions,
    atRetirement: {
      amounts,
      amountsInTodayDollars,
      growthMultiple:
        principalInvestmentAmount > 0
          ? round(totalAmount.toNumber() / principalInvestmentAmount, 4)
          : null,
      income:
        safeWithdrawalRate === undefined
          ? {
              perMonth: null,
              perMonthInTodayDollars: null,
              perYear: null,
              perYearInTodayDollars: null
            }
          : {
              perMonth: round(
                (totalAmount.toNumber() * safeWithdrawalRate) / COMPOUND_PERIOD
              ),
              perMonthInTodayDollars: round(
                ((amountsInTodayDollars.totalAmount ?? 0) *
                  safeWithdrawalRate) /
                  COMPOUND_PERIOD
              ),
              perYear: round(totalAmount.toNumber() * safeWithdrawalRate),
              perYearInTodayDollars: round(
                (amountsInTodayDollars.totalAmount ?? 0) * safeWithdrawalRate
              )
            }
    },
    horizon: {
      isReachable,
      mode,
      monthsToRetire: round(months),
      retirementDate: format(dateOfRetirementDate, DATE_FORMAT),
      targetAmount: horizon.targetAmount,
      yearsToRetire
    },
    incomeToday: incomeOfToday,
    ...getFireProjectionYears({
      asOf,
      dateOfRetirementDate,
      expectedInflationRate,
      oneTimeSavings: savings,
      paymentPerPeriod,
      principalInvestmentAmount,
      r
    })
  };
}

function calculatePeriodsWithoutOneTimeSavings({
  P,
  PMT,
  r,
  totalAmount
}: {
  P: number;
  PMT: number;
  r: number;
  totalAmount: number;
}) {
  if (totalAmount <= P) {
    // The target amount is reached already
    return 0;
  } else if (r === 0) {
    // No compound interest
    return (totalAmount - P) / PMT;
  }

  const periodInterest = new Big(r).div(COMPOUND_PERIOD);
  const numerator1: number = Math.log10(
    new Big(totalAmount).plus(new Big(PMT).div(periodInterest)).toNumber()
  );
  const numerator2: number = Math.log10(
    new Big(P).plus(new Big(PMT).div(periodInterest)).toNumber()
  );
  const denominator: number = Math.log10(
    new Big(1).plus(periodInterest).toNumber()
  );

  return (numerator1 - numerator2) / denominator;
}

/**
 * Gives the horizon of the projection. The number of months wins over the
 * target amount, which wins over the retirement date, because in the
 * calculator the target amount already wins over the retirement date: the time
 * to reach the amount is the more precise statement. An unreachable target
 * gives no horizon.
 */
function getFireProjectionHorizon({
  asOf,
  monthsToRetire,
  oneTimeSavings,
  paymentPerPeriod,
  principalInvestmentAmount,
  r,
  retirementDate,
  targetAmount
}: {
  asOf: Date;
  monthsToRetire?: number;
  oneTimeSavings: FireOneTimeSaving[];
  paymentPerPeriod: number;
  principalInvestmentAmount: number;
  r: number;
  retirementDate?: Date | null;
  targetAmount?: number;
}): FireProjectionHorizon {
  const startOfMonthOfAsOf = startOfMonth(asOf);
  const months = toNumber(monthsToRetire);

  if (months !== undefined && months >= 0) {
    return {
      dateOfRetirementDate: startOfMonth(addMonths(asOf, Math.floor(months))),
      isReachable: true,
      mode: 'months',
      monthsToRetire: months,
      targetAmount: undefined
    };
  }

  const amount = toNumber(targetAmount);

  if (amount !== undefined && amount > 0) {
    // A target amount which the investment amount reaches already gives no
    // negative horizon
    const periods = Math.max(
      0,
      calculatePeriodsToRetire({
        P: principalInvestmentAmount,
        oneTimeSavings,
        PMT: paymentPerPeriod,
        r,
        totalAmount: amount
      })
    );

    if (Number.isFinite(periods)) {
      return {
        dateOfRetirementDate: startOfMonth(
          addMonths(asOf, Math.floor(periods))
        ),
        isReachable: true,
        mode: 'target-amount',
        monthsToRetire: periods,
        targetAmount: amount
      };
    }

    return {
      dateOfRetirementDate: null,
      isReachable: false,
      mode: 'target-amount',
      monthsToRetire: null,
      targetAmount: amount
    };
  }

  const date = retirementDate
    ? max([startOfMonth(new Date(retirementDate)), startOfMonthOfAsOf])
    : startOfMonth(
        addMonths(asOf, FIRE_DEFAULT_PROJECTION_YEARS * COMPOUND_PERIOD)
      );

  return {
    dateOfRetirementDate: date,
    isReachable: true,
    mode: 'retirement-date',
    monthsToRetire: Math.max(0, differenceInMonths(date, startOfMonthOfAsOf)),
    targetAmount: undefined
  };
}

/**
 * Gives a row per year of the projection, like the chart of the calculator:
 * the amount of the year in today's dollars, split into the deposits of the
 * investment amount, the savings of the payments, the one-time savings and the
 * interest. A year is valued at its end, so that the payments of the year are
 * counted completely.
 */
function getFireProjectionYears({
  asOf,
  dateOfRetirementDate,
  expectedInflationRate,
  oneTimeSavings,
  paymentPerPeriod,
  principalInvestmentAmount,
  r
}: {
  asOf: Date;
  dateOfRetirementDate: Date;
  expectedInflationRate: number;
  oneTimeSavings: FireOneTimeSaving[];
  paymentPerPeriod: number;
  principalInvestmentAmount: number;
  r: number;
}) {
  const monthOfAsOf = asOf.getMonth();
  const yearOfAsOf = asOf.getFullYear();
  const lastYear = dateOfRetirementDate.getFullYear();

  const years: FireProjectionYear[] = [];

  for (let year = yearOfAsOf; year <= lastYear; year++) {
    if (years.length >= FIRE_MAX_PROJECTION_YEARS) {
      return { years, yearsTruncated: true };
    }

    const periodInMonths =
      (year - yearOfAsOf + 1) * COMPOUND_PERIOD - monthOfAsOf;

    const { interest } = calculateCompoundInterest({
      P: principalInvestmentAmount,
      oneTimeSavings,
      periodInMonths,
      PMT: paymentPerPeriod,
      r
    });

    const oneTimeSavingsOfPeriod = calculateOneTimeSavings({
      oneTimeSavings,
      periodInMonths,
      r
    });

    const getPresentValue = (amount: Big | number) =>
      round(
        calculatePresentValue({
          amount: new Big(amount).toNumber(),
          expectedInflationRate,
          periodInMonths
        }).toNumber()
      );

    years.push({
      contributions: getPresentValue(paymentPerPeriod * periodInMonths),
      deposits: getPresentValue(principalInvestmentAmount),
      interest: getPresentValue(interest),
      monthsFromNow: periodInMonths,
      oneTimeSavings: getPresentValue(oneTimeSavingsOfPeriod.principal),
      totalAmount: getPresentValue(
        new Big(principalInvestmentAmount)
          .plus(paymentPerPeriod * periodInMonths)
          .plus(oneTimeSavingsOfPeriod.principal)
          .plus(interest)
      ),
      year
    });
  }

  return { years, yearsTruncated: false };
}

function getOneTimeSavings(
  oneTimeSavings: FireOneTimeSaving[] = []
): FireOneTimeSaving[] {
  return oneTimeSavings
    .filter(
      ({ amount, monthsFromNow }) =>
        Number.isFinite(amount) && amount > 0 && Number.isFinite(monthsFromNow)
    )
    .map(({ amount, monthsFromNow }) => {
      return {
        amount,
        monthsFromNow: Math.max(0, Math.floor(monthsFromNow))
      };
    });
}

function round(value: number, precision = 2) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = Math.pow(10, precision);

  return Math.round(value * factor) / factor;
}

/**
 * Gives the value if it is a number which can be calculated with, so that an
 * optional parameter is only used when it is given
 */
function toNumber(value?: number | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
