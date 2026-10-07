import { InvestmentItem } from '../investment-item.interface';

export interface PortfolioInvestmentsResponse {
  investments: InvestmentItem[];
  medianMonthlySavingsRate?: number | null;
  medianYearlySavingsRate?: number | null;
  savingsRate?: number;
  streaks: { currentStreak: number; longestStreak: number };
}
