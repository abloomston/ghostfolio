import { Activity } from '@ghostfolio/common/interfaces';

export interface PortfolioCalculatorActivity extends Pick<
  Activity,
  'tags' | 'type'
> {
  assetProfile: Pick<
    Activity['assetProfile'],
    'assetSubClass' | 'currency' | 'dataSource' | 'name' | 'symbol' | 'userId'
  >;
  date: string;
  fee: Big;
  feeInBaseCurrency: Big;
  // Present on LIABILITY activities that carry a fixed-rate mortgage. Optional
  // because synthetic activities (e.g. cash) do not set them.
  mortgageInterestRate?: number | null;
  mortgageStartDate?: Date | null;
  mortgageTermYears?: number | null;
  quantity: Big;
  unitPrice: Big;
}
