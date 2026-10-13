import { ImportService } from '@ghostfolio/api/app/import/import.service';
import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';
import { SymbolService } from '@ghostfolio/api/app/symbol/symbol.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import {
  getMaskedGhostfolioDataSource,
  getUnmaskedGhostfolioDataSource
} from '@ghostfolio/api/helper/data-source.helper';
import { ApiService } from '@ghostfolio/api/services/api/api.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { PortfolioTableService } from '@ghostfolio/api/services/portfolio-table/portfolio-table.service';
import { getIntervalFromDateRange } from '@ghostfolio/common/calculation-helper';
import { DEFAULT_LANGUAGE_CODE } from '@ghostfolio/common/config';
import { SubscriptionType } from '@ghostfolio/common/enums';
import { calculateFireProjection } from '@ghostfolio/common/fire-calculator.helper';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import { UserSettings } from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { hasScope, scopes } from '@ghostfolio/common/scopes';
import type { UserWithSettings } from '@ghostfolio/common/types';

import { HttpException, Injectable } from '@nestjs/common';
import { format, isValid, parseISO } from 'date-fns';
import { getReasonPhrase, StatusCodes } from 'http-status-codes';
import { isNumber } from 'lodash';
import { z } from 'zod';

import {
  CALCULATE_FIRE_PROJECTION_PARAMETERS,
  GET_ACCOUNTS_PARAMETERS,
  GET_ACTIVITIES_PARAMETERS,
  IMPORT_ACTIVITIES_PARAMETERS,
  SEARCH_ASSET_PROFILES_PARAMETERS
} from './mcp.schemas';

function getDate(value?: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = parseISO(value);

  return isValid(date) ? date : undefined;
}

/**
 * Gives a rate stored as a fraction, such as the safe withdrawal rate, in
 * percentage, which is the unit of the parameters of the tools
 */
function toPercentage(value?: number): number | undefined {
  return isNumber(value) ? Math.round(value * 10000) / 100 : undefined;
}

/**
 * Gives the cents of a monetary amount, so that the tools do not give the
 * floating point noise of the portfolio calculation
 */
function roundAmount(value?: number): number | undefined {
  return isNumber(value) ? Math.round(value * 100) / 100 : undefined;
}

/**
 * The monetary amounts of the FIRE calculator which the tools give only to an
 * access which reads the monetary values
 */
interface FireAmounts {
  paymentPerPeriod?: number;
  principalInvestmentAmount?: number;
  targetAmount?: number;
}

@Injectable()
export class McpService {
  public constructor(
    private readonly apiService: ApiService,
    private readonly configurationService: ConfigurationService,
    private readonly importService: ImportService,
    private readonly portfolioService: PortfolioService,
    private readonly portfolioTableService: PortfolioTableService,
    private readonly symbolService: SymbolService,
    private readonly userService: UserService
  ) {}

  public async getAccounts({
    accountIds,
    assetClasses,
    holding,
    userId
  }: z.infer<typeof GET_ACCOUNTS_PARAMETERS> & { userId: string }) {
    const filters = this.apiService.buildFiltersFromQueryParams({
      filterByAccounts: accountIds,
      filterByAssetClasses: assetClasses,
      filterByDataSource: holding?.dataSource,
      filterBySymbol: holding?.symbol
    });

    const table = await this.portfolioTableService.getAccountsTable({
      filters,
      userId
    });

    return this.getTextResult(table);
  }

  public async getActivities({
    activityTypes,
    assetClasses,
    holding,
    range,
    skip,
    take,
    userCurrency,
    userId
  }: z.infer<typeof GET_ACTIVITIES_PARAMETERS> & {
    userCurrency: string;
    userId: string;
  }) {
    let endDate: Date | undefined;
    let startDate: Date | undefined;

    if (range) {
      ({ endDate, startDate } = getIntervalFromDateRange({
        dateRange: range
      }));
    }

    const filters = this.apiService.buildFiltersFromQueryParams({
      filterByAssetClasses: assetClasses,
      filterByDataSource: holding?.dataSource,
      filterBySymbol: holding?.symbol
    });

    const table = await this.portfolioTableService.getActivitiesTable({
      endDate,
      filters,
      skip,
      startDate,
      take,
      userCurrency,
      userId,
      types: activityTypes
    });

    return this.getTextResult(table);
  }

  public async getPortfolio({ userId }: { userId: string }) {
    const table = await this.portfolioTableService.getHoldingsTable({
      userId,
      languageCode: DEFAULT_LANGUAGE_CODE
    });

    return this.getTextResult(table);
  }

  /**
   * Projects the FIRE calculator. The assumptions which are no monetary value
   * fall back to the settings of the user. The amounts (the investment amount,
   * the savings per month and the target amount) come from the parameters and
   * else, if the access reads the monetary values, from the portfolio.
   */
  public async calculateFireProjection({
    expectedInflationRateInPercentage,
    expectedReturnInPercentage,
    impersonationScopes,
    monthsToRetire,
    oneTimeSavings,
    paymentPerPeriod,
    principalInvestmentAmount,
    retirementDate,
    safeWithdrawalRateInPercentage,
    targetAmount,
    userId,
    userSettings,
    userSubscription
  }: z.infer<typeof CALCULATE_FIRE_PROJECTION_PARAMETERS> & {
    impersonationScopes: string[];
    userId: string;
    userSettings: UserSettings;
    userSubscription?: UserWithSettings['subscription'];
  }) {
    const amounts: FireAmounts = this.canReadMonetaryValues({
      impersonationScopes,
      userSettings,
      userSubscription
    })
      ? await this.getFireAmounts({ userId, userSettings })
      : {};

    const projection = calculateFireProjection({
      expectedInflationRateInPercentage:
        expectedInflationRateInPercentage ??
        userSettings.expectedInflationRate ??
        0,
      expectedReturnInPercentage:
        expectedReturnInPercentage ?? userSettings.annualInterestRate ?? 0,
      monthsToRetire,
      oneTimeSavings: (oneTimeSavings ?? []).map(({ amount, date }) => {
        return { amount, date: getDate(date) };
      }),
      paymentPerPeriod: paymentPerPeriod ?? amounts.paymentPerPeriod ?? 0,
      principalInvestmentAmount:
        principalInvestmentAmount ?? amounts.principalInvestmentAmount ?? 0,
      retirementDate:
        getDate(retirementDate) ?? getDate(userSettings.retirementDate),
      safeWithdrawalRateInPercentage:
        safeWithdrawalRateInPercentage ??
        toPercentage(userSettings.safeWithdrawalRate),
      // The target amount which the user has saved is only the horizon of the
      // projection if the parameters give no horizon themselves
      targetAmount:
        targetAmount ??
        (monthsToRetire === undefined && retirementDate === undefined
          ? amounts.targetAmount
          : undefined)
    });

    return this.getTextResult(
      JSON.stringify(
        {
          baseCurrency: userSettings.baseCurrency,
          ...projection
        },
        null,
        2
      )
    );
  }

  /**
   * Gives the assumptions of the FIRE calculator which the access may read:
   * the rates and the retirement date always, the amounts only if the access
   * reads the monetary values
   */
  public async getFireAssumptions({
    impersonationScopes,
    userId,
    userSettings,
    userSubscription
  }: {
    impersonationScopes: string[];
    userId: string;
    userSettings: UserSettings;
    userSubscription?: UserWithSettings['subscription'];
  }) {
    const amounts: FireAmounts = this.canReadMonetaryValues({
      impersonationScopes,
      userSettings,
      userSubscription
    })
      ? await this.getFireAmounts({ userId, userSettings })
      : {};

    const dateOfRetirementDate = getDate(userSettings.retirementDate);

    return this.getTextResult(
      JSON.stringify(
        {
          baseCurrency: userSettings.baseCurrency,
          cashInterestRateInPercentage: userSettings.cashInterestRate ?? null,
          expectedInflationRateInPercentage:
            userSettings.expectedInflationRate ?? null,
          expectedReturnInPercentage: userSettings.annualInterestRate ?? null,
          paymentPerPeriod: amounts.paymentPerPeriod ?? null,
          principalInvestmentAmount: amounts.principalInvestmentAmount ?? null,
          retirementDate: dateOfRetirementDate
            ? format(dateOfRetirementDate, DATE_FORMAT)
            : null,
          safeWithdrawalRateInPercentage:
            toPercentage(userSettings.safeWithdrawalRate) ?? null,
          targetAmount: amounts.targetAmount ?? null
        },
        null,
        2
      )
    );
  }

  public async getWatchlist({ userId }: { userId: string }) {
    const table = await this.portfolioTableService.getWatchlistTable({
      userId
    });

    return this.getTextResult(table);
  }

  public async importActivities({
    activities,
    userId
  }: z.infer<typeof IMPORT_ACTIVITIES_PARAMETERS> & { userId: string }) {
    const user = await this.getUserWithPermission({
      userId,
      permission: permissions.createActivity
    });

    const ghostfolioDataSources = this.configurationService.get(
      'ENABLE_FEATURE_SUBSCRIPTION'
    )
      ? this.configurationService.get('DATA_SOURCES_GHOSTFOLIO_DATA_PROVIDER')
      : [];

    const activitiesDto = activities.map((activity) => {
      return {
        ...activity,
        dataSource: getUnmaskedGhostfolioDataSource({
          ghostfolioDataSources,
          dataSource: activity.dataSource
        })
      };
    });

    // The filter passes on the message of a CallerFacingError, which is
    // written for the caller, and hides the message of every other error
    const importedActivities = await this.importService.import({
      activitiesDto,
      user,
      accountsWithBalancesDto: [],
      assetProfilesWithMarketDataDto: [],
      platformsDto: [],
      tagsDto: []
    });

    const text = [
      `Imported activities: ${importedActivities.length}`,
      `Skipped duplicate activities: ${
        activities.length - importedActivities.length
      }`
    ].join('\n');

    return this.getTextResult(text);
  }

  public async searchAssetProfiles({
    query,
    userId
  }: z.infer<typeof SEARCH_ASSET_PROFILES_PARAMETERS> & { userId: string }) {
    const user = await this.getUserWithPermission({
      userId,
      permission: permissions.createActivity
    });

    const { items } = await this.symbolService.lookup({ query, user });

    const ghostfolioDataSources = this.configurationService.get(
      'ENABLE_FEATURE_SUBSCRIPTION'
    )
      ? this.configurationService.get('DATA_SOURCES_GHOSTFOLIO_DATA_PROVIDER')
      : [];

    const assetProfiles = items.flatMap(
      ({
        assetClass,
        assetSubClass,
        currency,
        dataProviderInfo,
        dataSource,
        name,
        symbol
      }) => {
        if (!dataSource || dataProviderInfo.isPremium) {
          return [];
        }

        return [
          {
            assetClass,
            assetSubClass,
            currency,
            name,
            symbol,
            dataSource: getMaskedGhostfolioDataSource({
              dataSource,
              ghostfolioDataSources
            })
          }
        ];
      }
    );

    return this.getTextResult(JSON.stringify({ assetProfiles }, null, 2));
  }

  /**
   * Gives whether the tools may read the monetary values, which follows the
   * endpoints of the portfolio: the access needs the scope to read them, the
   * user has to give no restricted view and, where the subscription is
   * enabled, has to be a premium subscriber
   */
  private canReadMonetaryValues({
    impersonationScopes,
    userSettings,
    userSubscription
  }: {
    impersonationScopes: string[];
    userSettings: UserSettings;
    userSubscription?: UserWithSettings['subscription'];
  }) {
    if (!hasScope(impersonationScopes, scopes.portfolioReadValues)) {
      return false;
    } else if (userSettings.isRestrictedView) {
      return false;
    } else if (
      this.configurationService.get('ENABLE_FEATURE_SUBSCRIPTION') &&
      userSubscription?.type !== SubscriptionType.Premium
    ) {
      return false;
    }

    return true;
  }

  /**
   * Gives the amounts of the FIRE calculator which the portfolio and the
   * settings of the user provide: the FIRE wealth, which is the value of the
   * portfolio without the emergency fund, the savings per month and the target
   * amount
   */
  private async getFireAmounts({
    userId,
    userSettings
  }: {
    userId: string;
    userSettings: UserSettings;
  }): Promise<FireAmounts> {
    const { summary } = await this.portfolioService.getDetails({
      userId,
      withSummary: true
    });

    return {
      paymentPerPeriod: roundAmount(userSettings.savingsRate),
      principalInvestmentAmount: roundAmount(
        summary?.fireWealth?.today?.valueInBaseCurrency
      ),
      targetAmount: roundAmount(userSettings.projectedTotalAmount)
    };
  }

  private getTextResult(text: string) {
    return { content: [{ text, type: 'text' as const }] };
  }

  /**
   * Gives the user of the access, if the role of the user has the permission.
   * The scope of the access is evaluated separately by the ScopeGuard, hence a
   * tool which changes data has to call this.
   */
  private async getUserWithPermission({
    permission,
    userId
  }: {
    permission: string;
    userId: string;
  }) {
    const user = await this.userService.user({ id: userId });

    if (!hasPermission(user?.permissions, permission)) {
      throw new HttpException(
        getReasonPhrase(StatusCodes.FORBIDDEN),
        StatusCodes.FORBIDDEN
      );
    }

    return user;
  }
}
