import {
  calculateAnnualizedReturnFromHistory,
  calculateCompoundInterest,
  calculateOneTimeSavings,
  calculatePeriodsToRetire,
  calculatePresentValue,
  calculateWeightedPortfolioReturn,
  getMonthsFromNow,
  toOneTimeSavings
} from '@ghostfolio/common/fire-calculator.helper';
import {
  FireOneTimeSaving,
  HistoricalDataItem
} from '@ghostfolio/common/interfaces';

import { Service } from '@angular/core';

/**
 * Wrapper of the calculations of the FIRE calculator, which live in
 * `@ghostfolio/common/fire-calculator.helper` so that the server can use them
 * as well
 */
@Service({ autoProvided: false })
export class FireCalculatorService {
  public calculateAnnualizedReturnFromHistory(params: {
    asOf?: Date;
    currentPrice: number;
    history: Pick<HistoricalDataItem, 'date' | 'marketPrice'>[];
    years: number;
  }): number | undefined {
    return calculateAnnualizedReturnFromHistory(params);
  }

  public calculateWeightedPortfolioReturn(
    assets: { annualizedReturn?: number; value: number }[]
  ): number | undefined {
    return calculateWeightedPortfolioReturn(assets);
  }

  public calculateCompoundInterest(params: {
    P: number;
    oneTimeSavings?: FireOneTimeSaving[];
    periodInMonths: number;
    PMT: number;
    r: number;
  }) {
    return calculateCompoundInterest(params);
  }

  /**
   * Value of the one-time savings (lump sums) contributed up to
   * `periodInMonths`, given as principal (deposited) and total amount
   * (including the interest they earned).
   */
  public calculateOneTimeSavings(params: {
    oneTimeSavings?: FireOneTimeSaving[];
    periodInMonths: number;
    r: number;
  }) {
    return calculateOneTimeSavings(params);
  }

  /**
   * Number of months from today a date is away, 0 for the current month, so
   * that a saving added in the current month counts right now.
   */
  public getMonthsFromNow(params: { asOf?: Date; date?: Date | null }): number {
    return getMonthsFromNow(params);
  }

  /**
   * Maps the one-time savings of the calculator form to the periods used by
   * the calculations, where `monthsFromNow` is 0 for a saving added right now.
   */
  public toOneTimeSavings(params: {
    asOf?: Date;
    savings: { amount?: number | null; date?: Date | null }[];
  }): FireOneTimeSaving[] {
    return toOneTimeSavings(params);
  }

  public calculatePresentValue(params: {
    amount: number;
    expectedInflationRate: number;
    periodInMonths: number;
  }) {
    return calculatePresentValue(params);
  }

  public calculatePeriodsToRetire(params: {
    P: number;
    oneTimeSavings?: FireOneTimeSaving[];
    PMT: number;
    r: number;
    totalAmount: number;
  }) {
    return calculatePeriodsToRetire(params);
  }
}
