import { ImportService } from '@ghostfolio/api/app/import/import.service';
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
import { calculateFireProjection } from '@ghostfolio/common/fire-calculator.helper';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import { UserSettings } from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';

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

@Injectable()
export class McpService {
  public constructor(
    private readonly apiService: ApiService,
    private readonly configurationService: ConfigurationService,
    private readonly importService: ImportService,
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
   * Projects the FIRE calculator with the parameters of the tool, where the
   * assumptions which are no monetary value fall back to the settings of the
   * user. The investment amount, the savings per month and the target amount
   * are never taken from the portfolio, because an access of the model context
   * protocol gives no monetary values.
   */
  public calculateFireProjection({
    expectedInflationRateInPercentage,
    expectedReturnInPercentage,
    monthsToRetire,
    oneTimeSavings,
    paymentPerPeriod,
    principalInvestmentAmount,
    retirementDate,
    safeWithdrawalRateInPercentage,
    targetAmount,
    userSettings
  }: z.infer<typeof CALCULATE_FIRE_PROJECTION_PARAMETERS> & {
    userSettings: UserSettings;
  }) {
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
      paymentPerPeriod,
      principalInvestmentAmount,
      retirementDate:
        getDate(retirementDate) ?? getDate(userSettings.retirementDate),
      safeWithdrawalRateInPercentage:
        safeWithdrawalRateInPercentage ??
        toPercentage(userSettings.safeWithdrawalRate),
      targetAmount
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
   * Gives the assumptions of the FIRE calculator which the user has saved and
   * which are no monetary value, hence which the access may read
   */
  public getFireAssumptions({ userSettings }: { userSettings: UserSettings }) {
    const dateOfRetirementDate = getDate(userSettings.retirementDate);

    return this.getTextResult(
      JSON.stringify(
        {
          baseCurrency: userSettings.baseCurrency,
          cashInterestRateInPercentage: userSettings.cashInterestRate ?? null,
          expectedInflationRateInPercentage:
            userSettings.expectedInflationRate ?? null,
          expectedReturnInPercentage: userSettings.annualInterestRate ?? null,
          retirementDate: dateOfRetirementDate
            ? format(dateOfRetirementDate, DATE_FORMAT)
            : null,
          safeWithdrawalRateInPercentage:
            toPercentage(userSettings.safeWithdrawalRate) ?? null
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
