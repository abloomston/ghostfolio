import { ImportValidationError } from '@ghostfolio/api/app/import/errors/import-validation.error';
import { ImportService } from '@ghostfolio/api/app/import/import.service';
import { SymbolService } from '@ghostfolio/api/app/symbol/symbol.service';
import { UserService } from '@ghostfolio/api/app/user/user.service';
import { ApiService } from '@ghostfolio/api/services/api/api.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { PortfolioTableService } from '@ghostfolio/api/services/portfolio-table/portfolio-table.service';
import {
  DEFAULT_LANGUAGE_CODE,
  MCP_MAX_ACTIVITIES
} from '@ghostfolio/common/config';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import { Activity, Filter, UserSettings } from '@ghostfolio/common/interfaces';
import { permissions } from '@ghostfolio/common/permissions';
import type { UserWithSettings } from '@ghostfolio/common/types';

import { HttpException } from '@nestjs/common';
import {
  AssetClass,
  AssetSubClass,
  DataSource,
  Type as ActivityType
} from '@prisma/client';
import { addMonths, addYears, format, startOfMonth } from 'date-fns';
import { z } from 'zod';

import { CALCULATE_FIRE_PROJECTION_PARAMETERS } from './mcp.schemas';
import { McpService } from './mcp.service';
import { createActivity } from './mcp.test-utils';

describe('McpService', () => {
  const filters: Filter[] = [{ id: 'account-id', type: 'ACCOUNT' }];
  const userCurrency = 'USD';
  const userId = 'user-id';

  let apiService: ApiService;
  let configuration: Record<string, unknown>;
  let configurationService: ConfigurationService;
  let importService: ImportService;
  let mcpService: McpService;
  let portfolioTableService: PortfolioTableService;
  let symbolService: SymbolService;
  let userService: UserService;

  function setupUser(userPermissions: string[]) {
    const user = {
      id: userId,
      permissions: userPermissions
    } as UserWithSettings;

    jest.spyOn(userService, 'user').mockResolvedValue(user);

    return user;
  }

  beforeEach(() => {
    configuration = {
      DATA_SOURCES_GHOSTFOLIO_DATA_PROVIDER: [],
      ENABLE_FEATURE_SUBSCRIPTION: false
    };

    configurationService = {
      get: jest.fn().mockImplementation((key: string) => {
        return configuration[key];
      })
    } as unknown as ConfigurationService;

    apiService = {
      buildFiltersFromQueryParams: jest.fn().mockReturnValue(filters)
    } as unknown as ApiService;

    importService = {
      import: jest.fn().mockResolvedValue([])
    } as unknown as ImportService;

    portfolioTableService = {
      getAccountsTable: jest.fn().mockResolvedValue('## Accounts'),
      getActivitiesTable: jest.fn().mockResolvedValue('## Activities'),
      getHoldingsTable: jest.fn().mockResolvedValue('## Holdings'),
      getWatchlistTable: jest.fn().mockResolvedValue('## Watchlist')
    } as unknown as PortfolioTableService;

    symbolService = {
      lookup: jest.fn().mockResolvedValue({ items: [] })
    } as unknown as SymbolService;

    userService = { user: jest.fn() } as unknown as UserService;

    mcpService = new McpService(
      apiService,
      configurationService,
      importService,
      portfolioTableService,
      symbolService,
      userService
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getAccounts', () => {
    it('Maps the parameters of the tool to the filters', async () => {
      await mcpService.getAccounts({
        userId,
        accountIds: ['account-id'],
        assetClasses: [AssetClass.EQUITY],
        holding: { dataSource: DataSource.YAHOO, symbol: 'AAPL' }
      });

      expect(apiService.buildFiltersFromQueryParams).toHaveBeenCalledWith({
        filterByAccounts: ['account-id'],
        filterByAssetClasses: [AssetClass.EQUITY],
        filterByDataSource: DataSource.YAHOO,
        filterBySymbol: 'AAPL'
      });
    });

    it('Gives the table of the accounts of the filters', async () => {
      expect(await mcpService.getAccounts({ userId })).toEqual({
        content: [{ text: '## Accounts', type: 'text' }]
      });

      expect(portfolioTableService.getAccountsTable).toHaveBeenCalledWith({
        filters,
        userId
      });
    });
  });

  describe('getActivities', () => {
    function getActivities(
      parameters: Partial<Parameters<McpService['getActivities']>[0]> = {}
    ) {
      return mcpService.getActivities({
        userCurrency,
        userId,
        take: MCP_MAX_ACTIVITIES,
        ...parameters
      });
    }

    it('Maps the parameters of the tool to the filters', async () => {
      await getActivities({
        assetClasses: [AssetClass.EQUITY],
        holding: { dataSource: DataSource.YAHOO, symbol: 'AAPL' }
      });

      expect(apiService.buildFiltersFromQueryParams).toHaveBeenCalledWith({
        filterByAssetClasses: [AssetClass.EQUITY],
        filterByDataSource: DataSource.YAHOO,
        filterBySymbol: 'AAPL'
      });
    });

    it('Changes the range into the start date and the end date', async () => {
      await getActivities({ range: '2024' });

      expect(portfolioTableService.getActivitiesTable).toHaveBeenCalledWith(
        expect.objectContaining({
          endDate: new Date('2024-12-31T23:59:59.999Z'),
          startDate: new Date('2023-12-31T23:59:59.999Z')
        })
      );
    });

    it('Gives no date if the range is absent', async () => {
      await getActivities();

      expect(portfolioTableService.getActivitiesTable).toHaveBeenCalledWith(
        expect.objectContaining({ endDate: undefined, startDate: undefined })
      );
    });

    it('Gives the table of the activities of the filters', async () => {
      expect(
        await getActivities({ activityTypes: [ActivityType.BUY], skip: 10 })
      ).toEqual({ content: [{ text: '## Activities', type: 'text' }] });

      expect(portfolioTableService.getActivitiesTable).toHaveBeenCalledWith({
        filters,
        userCurrency,
        userId,
        endDate: undefined,
        skip: 10,
        startDate: undefined,
        take: MCP_MAX_ACTIVITIES,
        types: [ActivityType.BUY]
      });
    });
  });

  describe('getPortfolio', () => {
    it('Gives the table of the holdings in the default language', async () => {
      expect(await mcpService.getPortfolio({ userId })).toEqual({
        content: [{ text: '## Holdings', type: 'text' }]
      });

      expect(portfolioTableService.getHoldingsTable).toHaveBeenCalledWith({
        userId,
        languageCode: DEFAULT_LANGUAGE_CODE
      });
    });
  });

  describe('getWatchlist', () => {
    it('Gives the table of the watchlist', async () => {
      expect(await mcpService.getWatchlist({ userId })).toEqual({
        content: [{ text: '## Watchlist', type: 'text' }]
      });

      expect(portfolioTableService.getWatchlistTable).toHaveBeenCalledWith({
        userId
      });
    });
  });

  describe('getFireAssumptions', () => {
    const userSettings = {
      annualInterestRate: 7,
      baseCurrency: 'USD',
      cashInterestRate: 1.5,
      expectedInflationRate: 2.5,
      projectedTotalAmount: 1000000,
      retirementDate: '2036-05-01',
      safeWithdrawalRate: 0.035,
      savingsRate: 2000
    } as UserSettings;

    it('Gives the rates in percentage and the retirement date of the month', () => {
      expect(
        JSON.parse(
          mcpService.getFireAssumptions({ userSettings }).content[0].text
        )
      ).toEqual({
        baseCurrency: 'USD',
        cashInterestRateInPercentage: 1.5,
        expectedInflationRateInPercentage: 2.5,
        expectedReturnInPercentage: 7,
        retirementDate: '2036-05-01',
        safeWithdrawalRateInPercentage: 3.5
      });
    });

    // An access of the model context protocol never reads the monetary values,
    // hence the projection has to get them from the client
    it('Gives no monetary assumption', () => {
      const assumptions = JSON.parse(
        mcpService.getFireAssumptions({ userSettings }).content[0].text
      );

      expect(Object.keys(assumptions)).toEqual([
        'baseCurrency',
        'cashInterestRateInPercentage',
        'expectedInflationRateInPercentage',
        'expectedReturnInPercentage',
        'retirementDate',
        'safeWithdrawalRateInPercentage'
      ]);
    });

    it('Gives null for an assumption which the user has not saved', () => {
      expect(
        JSON.parse(
          mcpService.getFireAssumptions({
            userSettings: { baseCurrency: 'USD' } as UserSettings
          }).content[0].text
        )
      ).toEqual({
        baseCurrency: 'USD',
        cashInterestRateInPercentage: null,
        expectedInflationRateInPercentage: null,
        expectedReturnInPercentage: null,
        retirementDate: null,
        safeWithdrawalRateInPercentage: null
      });
    });
  });

  describe('calculateFireProjection', () => {
    const userSettings = {
      annualInterestRate: 7,
      baseCurrency: 'USD',
      expectedInflationRate: 2.5,
      projectedTotalAmount: 1000000,
      retirementDate: format(addYears(new Date(), 10), DATE_FORMAT),
      safeWithdrawalRate: 0.04,
      savingsRate: 2000
    } as UserSettings;

    function calculate(
      parameters: Partial<
        z.infer<typeof CALCULATE_FIRE_PROJECTION_PARAMETERS>
      > = {}
    ) {
      return JSON.parse(
        mcpService.calculateFireProjection({
          paymentPerPeriod: 1000,
          principalInvestmentAmount: 100000,
          userSettings,
          ...parameters
        }).content[0].text
      );
    }

    it('Falls back to the assumptions the user has saved', () => {
      const projection = calculate();

      expect(projection.baseCurrency).toEqual('USD');
      expect(projection.assumptions).toEqual({
        expectedInflationRateInPercentage: 2.5,
        expectedReturnInPercentage: 7,
        oneTimeSavings: [],
        paymentPerPeriod: 1000,
        principalInvestmentAmount: 100000,
        safeWithdrawalRateInPercentage: 4
      });
      expect(projection.horizon.mode).toEqual('retirement-date');
      expect(projection.horizon.retirementDate).toEqual(
        format(startOfMonth(addYears(new Date(), 10)), DATE_FORMAT)
      );
    });

    it('Prefers the parameters over the assumptions the user has saved', () => {
      const projection = calculate({
        expectedInflationRateInPercentage: 0,
        expectedReturnInPercentage: 0,
        monthsToRetire: 12,
        safeWithdrawalRateInPercentage: 3
      });

      expect(projection.horizon.mode).toEqual('months');
      expect(projection.atRetirement.amounts).toEqual({
        contributions: 12000,
        deposits: 100000,
        interest: 0,
        oneTimeSavings: 0,
        totalAmount: 112000
      });
      expect(projection.atRetirement.income.perYear).toEqual(3360);
      expect(projection.atRetirement.income.perMonth).toEqual(280);
      expect(projection.incomeToday).toEqual({
        perMonth: 250,
        perYear: 3000
      });
    });

    it('Gives the income of the projected amount and the composition of it', () => {
      const projection = calculate({
        expectedInflationRateInPercentage: 0,
        expectedReturnInPercentage: 6,
        monthsToRetire: 240,
        safeWithdrawalRateInPercentage: 4
      });

      const { amounts, income } = projection.atRetirement;

      expect(
        amounts.deposits +
          amounts.contributions +
          amounts.oneTimeSavings +
          amounts.interest
      ).toBeCloseTo(amounts.totalAmount, 1);
      expect(income.perYear).toBeCloseTo(amounts.totalAmount * 0.04, 1);
      expect(income.perMonth).toBeCloseTo(income.perYear / 12, 2);
    });

    it('Reads no monetary value of the portfolio', () => {
      calculate();

      expect(portfolioTableService.getHoldingsTable).not.toHaveBeenCalled();
      expect(portfolioTableService.getAccountsTable).not.toHaveBeenCalled();
      expect(userService.user).not.toHaveBeenCalled();
    });

    it('Maps the month of a one-time saving', () => {
      const projection = calculate({
        expectedReturnInPercentage: 0,
        monthsToRetire: 6,
        oneTimeSavings: [
          {
            amount: 10000,
            date: format(addMonths(new Date(), 6), DATE_FORMAT)
          }
        ],
        paymentPerPeriod: 0,
        principalInvestmentAmount: 0
      });

      expect(projection.assumptions.oneTimeSavings).toEqual([
        { amount: 10000, monthsFromNow: 6 }
      ]);
      expect(projection.atRetirement.amounts.totalAmount).toEqual(10000);
    });

    it('Reports an unreachable target amount', () => {
      const projection = calculate({
        expectedReturnInPercentage: 0,
        paymentPerPeriod: 0,
        principalInvestmentAmount: 1000,
        targetAmount: 1000000
      });

      expect(projection.horizon).toEqual({
        isReachable: false,
        mode: 'target-amount',
        monthsToRetire: null,
        retirementDate: null,
        targetAmount: 1000000,
        yearsToRetire: null
      });
      expect(projection.atRetirement.amounts).toBeNull();
    });
  });

  describe('searchAssetProfiles', () => {
    it('Refuses a user without the permission to create an activity', async () => {
      setupUser([]);

      await expect(
        mcpService.searchAssetProfiles({ query: 'Apple', userId })
      ).rejects.toThrow(HttpException);

      expect(symbolService.lookup).not.toHaveBeenCalled();
    });

    it('Gives the import-ready asset profiles available to the user', async () => {
      const user = setupUser([permissions.createActivity]);

      configuration.DATA_SOURCES_GHOSTFOLIO_DATA_PROVIDER = [DataSource.YAHOO];
      configuration.ENABLE_FEATURE_SUBSCRIPTION = true;

      jest.spyOn(symbolService, 'lookup').mockResolvedValue({
        items: [
          {
            assetClass: AssetClass.EQUITY,
            assetSubClass: AssetSubClass.STOCK,
            currency: 'USD',
            dataProviderInfo: { isPremium: false },
            dataSource: DataSource.YAHOO,
            name: 'Apple Inc.',
            symbol: 'AAPL'
          },
          {
            assetClass: AssetClass.EQUITY,
            assetSubClass: AssetSubClass.STOCK,
            currency: 'USD',
            dataProviderInfo: { isPremium: true },
            dataSource: DataSource.GHOSTFOLIO,
            name: 'Premium asset',
            symbol: 'PREMIUM'
          }
        ]
      });

      const result = await mcpService.searchAssetProfiles({
        query: 'Apple',
        userId
      });

      expect(symbolService.lookup).toHaveBeenCalledWith({
        query: 'Apple',
        user
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        assetProfiles: [
          {
            assetClass: AssetClass.EQUITY,
            assetSubClass: AssetSubClass.STOCK,
            currency: 'USD',
            dataSource: DataSource.GHOSTFOLIO,
            name: 'Apple Inc.',
            symbol: 'AAPL'
          }
        ]
      });
    });
  });

  describe('importActivities', () => {
    it('Refuses a user without the permission to create an activity', async () => {
      setupUser([]);

      await expect(
        mcpService.importActivities({
          userId,
          activities: [createActivity()]
        })
      ).rejects.toThrow(HttpException);

      expect(importService.import).not.toHaveBeenCalled();
    });

    it('Gives the number of the imported and of the skipped activities', async () => {
      setupUser([permissions.createActivity]);

      jest
        .spyOn(importService, 'import')
        .mockResolvedValue([{ id: 'activity-id' } as Activity]);

      expect(
        await mcpService.importActivities({
          userId,
          activities: [createActivity(), createActivity({ quantity: 2 })]
        })
      ).toEqual({
        content: [
          {
            text: 'Imported activities: 1\nSkipped duplicate activities: 1',
            type: 'text'
          }
        ]
      });
    });

    it('Resolves the mask of the data source of the Ghostfolio data provider', async () => {
      setupUser([permissions.createActivity]);

      configuration.DATA_SOURCES_GHOSTFOLIO_DATA_PROVIDER = [DataSource.YAHOO];
      configuration.ENABLE_FEATURE_SUBSCRIPTION = true;

      await mcpService.importActivities({
        userId,
        activities: [createActivity({ dataSource: DataSource.GHOSTFOLIO })]
      });

      expect(importService.import).toHaveBeenCalledWith(
        expect.objectContaining({
          activitiesDto: [
            expect.objectContaining({ dataSource: DataSource.YAHOO })
          ]
        })
      );
    });

    it('Keeps the data source if the subscription is not enabled', async () => {
      setupUser([permissions.createActivity]);

      configuration.DATA_SOURCES_GHOSTFOLIO_DATA_PROVIDER = [DataSource.YAHOO];
      configuration.ENABLE_FEATURE_SUBSCRIPTION = false;

      await mcpService.importActivities({
        userId,
        activities: [createActivity({ dataSource: DataSource.GHOSTFOLIO })]
      });

      expect(importService.import).toHaveBeenCalledWith(
        expect.objectContaining({
          activitiesDto: [
            expect.objectContaining({ dataSource: DataSource.GHOSTFOLIO })
          ]
        })
      );
    });

    // The McpToolExceptionFilter maps the error, hence the tool passes it on
    it('Passes on an error of the import', async () => {
      setupUser([permissions.createActivity]);

      const error = new ImportValidationError(
        'activities.0.symbol ("X") is not valid'
      );

      jest.spyOn(importService, 'import').mockRejectedValue(error);

      await expect(
        mcpService.importActivities({
          userId,
          activities: [createActivity()]
        })
      ).rejects.toBe(error);
    });
  });
});
