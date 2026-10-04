import { HistoricalDataItem } from '@ghostfolio/common/interfaces';

import { Service } from '@angular/core';
import { Big } from 'big.js';
import { subYears } from 'date-fns';

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
    periodInMonths,
    PMT,
    r
  }: {
    P: number;
    periodInMonths: number;
    PMT: number;
    r: number;
  }) {
    let interest = new Big(0);
    const principal = new Big(P).plus(new Big(PMT).mul(periodInMonths));
    let totalAmount = principal;

    if (r) {
      const compoundInterestForPrincipal = new Big(1)
        .plus(new Big(r).div(this.COMPOUND_PERIOD))
        .pow(periodInMonths);
      const compoundInterest = new Big(P).mul(compoundInterestForPrincipal);
      const contributionInterest = new Big(
        new Big(PMT).mul(compoundInterestForPrincipal.minus(1))
      ).div(new Big(r).div(this.COMPOUND_PERIOD));
      interest = compoundInterest.plus(contributionInterest).minus(principal);
      totalAmount = compoundInterest.plus(contributionInterest);
    }

    return {
      interest,
      principal,
      totalAmount
    };
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
}
