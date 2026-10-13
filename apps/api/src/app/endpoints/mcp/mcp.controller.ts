import { Impersonation } from '@ghostfolio/api/decorators/impersonation.decorator';
import { RequiresScopeOfAccess } from '@ghostfolio/api/decorators/requires-scope-of-access.decorator';
import { McpToolExceptionFilter } from '@ghostfolio/api/filters/mcp-tool-exception.filter';
import { PortfolioTableService } from '@ghostfolio/api/services/portfolio-table/portfolio-table.service';
import { MCP_MAX_ACTIVITIES } from '@ghostfolio/common/config';
import { scopes } from '@ghostfolio/common/scopes';
import type { ImpersonationContext } from '@ghostfolio/common/types';

import { UseFilters } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { McpController, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import 'zod/compile';

import {
  CALCULATE_FIRE_PROJECTION_PARAMETERS,
  GET_ACCOUNTS_PARAMETERS,
  GET_ACTIVITIES_PARAMETERS,
  IMPORT_ACTIVITIES_PARAMETERS,
  SEARCH_ASSET_PROFILES_PARAMETERS
} from './mcp.schemas';
import { McpService } from './mcp.service';

@McpController()
@UseFilters(McpToolExceptionFilter)
export class GhostfolioMcpController {
  public constructor(private readonly mcpService: McpService) {}

  @RequiresScopeOfAccess(scopes.portfolioRead)
  @Tool({
    annotations: {
      openWorldHint: false,
      readOnlyHint: true,
      title: 'Calculate the projection of the FIRE calculator'
    },
    description: `Projects the FIRE (financial independence, retire early) calculator and gives the projected amount and the retirement income at retirement, so that the impact of each assumption can be seen. The investment amount, the savings per month, the one-time savings and the target amount have to be given as parameters, because an access never reads the monetary values of the portfolio: ask the user for them. The expected annual return, the expected annual inflation, the safe withdrawal rate and the retirement date default to the assumptions the user has saved, which get-fire-assumptions gives. The horizon of the projection is the target amount, else the number of months, else the retirement date, and an unreachable target is reported with "isReachable: false". Every amount is in the currency of the parameters; the amounts in today’s dollars are discounted by the expected annual inflation.`,
    name: 'calculate-fire-projection',
    parameters: CALCULATE_FIRE_PROJECTION_PARAMETERS
  })
  public calculateFireProjection(
    @Impersonation() { userSettings }: ImpersonationContext,
    @Payload()
    parameters: z.infer<typeof CALCULATE_FIRE_PROJECTION_PARAMETERS>
  ) {
    return this.mcpService.calculateFireProjection({
      ...parameters,
      userSettings
    });
  }

  @RequiresScopeOfAccess(scopes.accountRead)
  @Tool({
    annotations: {
      openWorldHint: false,
      readOnlyHint: true,
      title: 'Get accounts'
    },
    description: `Gives the accounts of the portfolio with these columns: ${PortfolioTableService.getAccountsTableColumnNames().join(
      ', '
    )}. The allocation in percentage is relative to the accounts of the result, hence the parameters change it.`,
    name: 'get-accounts',
    parameters: GET_ACCOUNTS_PARAMETERS
  })
  public async getAccounts(
    @Impersonation() { userId }: ImpersonationContext,
    @Payload() parameters: z.infer<typeof GET_ACCOUNTS_PARAMETERS>
  ) {
    return this.mcpService.getAccounts({ ...parameters, userId });
  }

  @RequiresScopeOfAccess(scopes.activityRead)
  @Tool({
    annotations: {
      openWorldHint: false,
      readOnlyHint: true,
      title: 'Get activities'
    },
    description: `Gives the activities of the portfolio, the most recent first, with these columns: ${PortfolioTableService.getActivitiesTableColumnNames().join(
      ', '
    )}. At most ${MCP_MAX_ACTIVITIES} activities are given per call, hence narrow the result with the parameters or get the further activities with the skip parameter.`,
    name: 'get-activities',
    parameters: GET_ACTIVITIES_PARAMETERS
  })
  public async getActivities(
    @Impersonation() { userId, userSettings }: ImpersonationContext,
    @Payload() parameters: z.infer<typeof GET_ACTIVITIES_PARAMETERS>
  ) {
    return this.mcpService.getActivities({
      ...parameters,
      userId,
      userCurrency: userSettings.baseCurrency
    });
  }

  @RequiresScopeOfAccess(scopes.portfolioRead)
  @Tool({
    annotations: {
      openWorldHint: false,
      readOnlyHint: true,
      title: 'Get the assumptions of the FIRE calculator'
    },
    description:
      'Gives the assumptions of the FIRE (financial independence, retire early) calculator which the user has saved: the expected annual return, the expected annual inflation, the safe withdrawal rate, the interest rate for cash and the retirement date. The monetary assumptions (the investment amount, the savings per month and the target amount) are not given, because an access never reads the monetary values of the portfolio: ask the user for them and pass them to calculate-fire-projection.',
    name: 'get-fire-assumptions'
  })
  public getFireAssumptions(
    @Impersonation() { userSettings }: ImpersonationContext
  ) {
    return this.mcpService.getFireAssumptions({ userSettings });
  }

  @RequiresScopeOfAccess(scopes.portfolioRead)
  @Tool({
    annotations: {
      openWorldHint: false,
      readOnlyHint: true,
      title: 'Get portfolio'
    },
    description: `Gives the holdings of the portfolio with these columns: ${PortfolioTableService.getHoldingsTableColumnNames().join(
      ', '
    )}.`,
    name: 'get-portfolio'
  })
  public async getPortfolio(@Impersonation() { userId }: ImpersonationContext) {
    return this.mcpService.getPortfolio({ userId });
  }

  @RequiresScopeOfAccess(scopes.watchlistRead)
  @Tool({
    annotations: {
      openWorldHint: false,
      readOnlyHint: true,
      title: 'Get watchlist'
    },
    description: `Gives the watchlist of the user, sorted by name, with these columns: ${PortfolioTableService.getWatchlistTableColumnNames().join(
      ', '
    )}. A trend compares the average market price of the last 50 or 200 days with the average of the 50 or 200 days before. A trend is UNKNOWN if there is not sufficient market data. The change from the all time high is the difference between the current market price and the all time high in percentage.`,
    name: 'get-watchlist'
  })
  public async getWatchlist(@Impersonation() { userId }: ImpersonationContext) {
    return this.mcpService.getWatchlist({ userId });
  }

  @RequiresScopeOfAccess(scopes.activityCreate)
  @Tool({
    annotations: {
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: false,
      title: 'Import activities'
    },
    description: `Imports activities into the portfolio and gives the number of the imported activities and the number of the skipped activities. Use search-asset-profiles first unless the exact symbol and data source are already known. An activity is skipped if an equal activity is in the portfolio already, hence send each activity one time only: two equal activities of the same call are both imported. At most ${MCP_MAX_ACTIVITIES} activities are imported per call, while the instance can have a lower limit, which an error names. An error does not remove the activities of the same call which are imported already, hence get the activities after an error before you import them again.`,
    name: 'import-activities',
    parameters: IMPORT_ACTIVITIES_PARAMETERS
  })
  public async importActivities(
    @Impersonation() { userId }: ImpersonationContext,
    @Payload() parameters: z.infer<typeof IMPORT_ACTIVITIES_PARAMETERS>
  ) {
    return this.mcpService.importActivities({ ...parameters, userId });
  }

  @RequiresScopeOfAccess(scopes.activityCreate)
  @Tool({
    annotations: {
      openWorldHint: true,
      readOnlyHint: true,
      title: 'Search asset profiles'
    },
    description:
      'Searches for financial assets, such as stocks, ETFs, cryptocurrencies, mutual funds and commodities, which are available to the user. Each result is an asset profile that can be used to import an activity. Use this before importing an activity unless the exact symbol and data source are already known. Select the candidate that matches the intended asset and pass its symbol, dataSource and currency unchanged to import-activities.',
    name: 'search-asset-profiles',
    parameters: SEARCH_ASSET_PROFILES_PARAMETERS
  })
  public async searchAssetProfiles(
    @Impersonation() { userId }: ImpersonationContext,
    @Payload() parameters: z.infer<typeof SEARCH_ASSET_PROFILES_PARAMETERS>
  ) {
    return this.mcpService.searchAssetProfiles({ ...parameters, userId });
  }
}
