import {
  FireOneTimeSaving,
  HistoricalDataItem
} from '@ghostfolio/common/interfaces';

import { Service } from '@angular/core';
import { Big } from 'big.js';
import { differenceInMonths, startOfMonth, subYears } from 'date-fns';

@Service({ autoProvided: false })
export class FireCalculatorService {
  private readonly COMPOUND_PERIOD = 12;

  public calculateAnnualizedReturnFromHistory({
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

  public calculateWeightedPortfolioReturn(
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

  public calculateCompoundInterest({
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
    } = this.calculateOneTimeSavings({ oneTimeSavings, periodInMonths, r });

    let interest = new Big(0);
    const principal = new Big(P)
      .plus(new Big(PMT).mul(periodInMonths))
      .plus(oneTimeSavingsPrincipal);
    let totalAmount = principal;

    if (r) {
      const compoundInterestForPrincipal = new Big(1)
        .plus(new Big(r).div(this.COMPOUND_PERIOD))
        .pow(periodInMonths);
      const compoundInterest = new Big(P).mul(compoundInterestForPrincipal);
      const contributionInterest = new Big(
        new Big(PMT).mul(compoundInterestForPrincipal.minus(1))
      ).div(new Big(r).div(this.COMPOUND_PERIOD));

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
  public calculateOneTimeSavings({
    oneTimeSavings = [],
    periodInMonths,
    r
  }: {
    oneTimeSavings?: FireOneTimeSaving[];
    periodInMonths: number;
    r: number;
  }) {
    const periodInterest = r / this.COMPOUND_PERIOD;

    return this.getOneTimeSavings(oneTimeSavings).reduce(
      (result, { amount, monthsFromNow }) => {
        if (monthsFromNow > periodInMonths) {
          return result;
        }

        return {
          principal: result.principal.plus(amount),
          totalAmount: result.totalAmount.plus(
            amount *
              Math.pow(1 + periodInterest, periodInMonths - monthsFromNow)
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
  public getMonthsFromNow({
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
  public toOneTimeSavings({
    asOf = new Date(),
    savings
  }: {
    asOf?: Date;
    savings: { amount?: number | null; date?: Date | null }[];
  }): FireOneTimeSaving[] {
    return this.getOneTimeSavings(
      (savings ?? []).map(({ amount, date }) => ({
        amount: Number(amount),
        monthsFromNow: this.getMonthsFromNow({ asOf, date })
      }))
    );
  }

  public calculatePresentValue({
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
      periodInMonths / this.COMPOUND_PERIOD
    );

    return new Big(amount).div(inflationFactor);
  }

  public calculatePeriodsToRetire({
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
    const relevantOneTimeSavings = this.getOneTimeSavings(oneTimeSavings);

    if (relevantOneTimeSavings.length === 0) {
      return this.calculatePeriodsWithoutOneTimeSavings({
        P,
        PMT,
        r,
        totalAmount
      });
    }

    const getAmountAt = (periodInMonths: number) =>
      this.calculateCompoundInterest({
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
      ...new Set(
        relevantOneTimeSavings.map(({ monthsFromNow }) => monthsFromNow)
      )
    ].sort((first, second) => first - second);

    for (const monthOfOneTimeSaving of monthsOfOneTimeSavings) {
      if (monthOfOneTimeSaving > period) {
        const periodsToRetire = this.calculatePeriodsWithoutOneTimeSavings({
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
      this.calculatePeriodsWithoutOneTimeSavings({
        P: amount,
        PMT,
        r,
        totalAmount
      })
    );
  }

  private calculatePeriodsWithoutOneTimeSavings({
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
    if (r === 0) {
      // No compound interest
      return (totalAmount - P) / PMT;
    } else if (totalAmount <= P) {
      return 0;
    }

    const periodInterest = new Big(r).div(this.COMPOUND_PERIOD);
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

  private getOneTimeSavings(
    oneTimeSavings: FireOneTimeSaving[] = []
  ): FireOneTimeSaving[] {
    return oneTimeSavings
      .filter(
        ({ amount, monthsFromNow }) =>
          Number.isFinite(amount) &&
          amount > 0 &&
          Number.isFinite(monthsFromNow)
      )
      .map(({ amount, monthsFromNow }) => ({
        amount,
        monthsFromNow: Math.max(0, Math.floor(monthsFromNow))
      }));
  }
}
