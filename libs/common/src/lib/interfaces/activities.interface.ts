import { EnhancedAssetProfile } from '@ghostfolio/common/interfaces';
import { AccountWithPlatform } from '@ghostfolio/common/types';

import { Order, Tag } from '@prisma/client';

export interface Activity extends Omit<
  Order,
  | 'mortgageInterestRate'
  | 'mortgageStartDate'
  | 'mortgageTermYears'
  | 'propertyValue'
> {
  // Optional on an Activity; only set on LIABILITY activities that carry a
  // fixed-rate mortgage (or a secured property).
  mortgageInterestRate?: number | null;
  mortgageStartDate?: Date | null;
  mortgageTermYears?: number | null;
  propertyValue?: number | null;
  account?: AccountWithPlatform;
  assetProfile: EnhancedAssetProfile;
  error?: ActivityError;
  feeInAssetProfileCurrency: number;
  feeInBaseCurrency: number;
  tagIds?: string[];
  tags?: Tag[];
  unitPriceInAssetProfileCurrency: number;
  updateAccountBalance?: boolean;
  value: number;
  valueInBaseCurrency: number;
}

export interface ActivityError {
  code: 'IS_DUPLICATE';
  message?: string;
}
