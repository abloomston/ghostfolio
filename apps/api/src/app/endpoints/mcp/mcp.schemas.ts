import { DATE_RANGE_PATTERN } from '@ghostfolio/api/dtos/date-range-filter.dto';
import {
  DATE_RANGES,
  FIRE_MAX_PROJECTION_YEARS,
  MCP_MAX_ACCOUNTS,
  MCP_MAX_ACTIVITIES,
  MCP_MAX_ONE_TIME_SAVINGS,
  SEARCH_QUERY_MAXIMUM_LENGTH,
  SEARCH_QUERY_MINIMUM_LENGTH
} from '@ghostfolio/common/config';
import {
  isValidCurrencyCode,
  isValidDateAfter1970
} from '@ghostfolio/common/helper';

import { AssetClass, DataSource, Type as ActivityType } from '@prisma/client';
import { z } from 'zod';

const HOLDING_PARAMETER = z.object({
  dataSource: z
    .enum(DataSource)
    .describe('The data source of the asset profile'),
  symbol: z.string().describe('The symbol of the asset profile')
});

export const CALCULATE_FIRE_PROJECTION_PARAMETERS = z.object({
  expectedInflationRateInPercentage: z
    .number()
    .min(-100)
    .max(100)
    .optional()
    .describe(
      'The expected annual inflation in percentage, for example 2.5 for 2.5%, which discounts the projection to today’s dollars. Defaults to the inflation rate the user has saved.'
    ),
  expectedReturnInPercentage: z
    .number()
    .min(-100)
    .max(100)
    .optional()
    .describe(
      'The expected annual return in percentage, for example 7 for 7%. Defaults to the expected annual return the user has saved.'
    ),
  monthsToRetire: z
    .number()
    .min(0)
    .max(FIRE_MAX_PROJECTION_YEARS * 12)
    .optional()
    .describe(
      `The number of months to project, at most ${
        FIRE_MAX_PROJECTION_YEARS * 12
      }. It wins over the target amount and over the retirement date.`
    ),
  oneTimeSavings: z
    .array(
      z.object({
        amount: z.number().min(0).describe('The amount of the one-time saving'),
        date: z
          .string()
          .refine(isValidDateAfter1970)
          .optional()
          .describe(
            'The month in which the one-time saving is contributed, as an ISO 8601 date, for example 2027-03-01. The saving counts from that month on and defaults to the current month.'
          )
      })
    )
    .min(1)
    .max(MCP_MAX_ONE_TIME_SAVINGS)
    .optional()
    .describe(
      `The one-time savings (lump sums) of the projection, at most ${MCP_MAX_ONE_TIME_SAVINGS}`
    ),
  paymentPerPeriod: z
    .number()
    .min(0)
    .describe(
      'The savings per month, which are contributed at the end of every month. Ask the user for the amount, because an access never reads the monetary values of the portfolio.'
    ),
  principalInvestmentAmount: z
    .number()
    .min(0)
    .describe(
      'The investment amount today, which is the value of the portfolio without the emergency fund, in the same currency as the savings per month. Ask the user for the amount, because an access never reads the monetary values of the portfolio.'
    ),
  retirementDate: z
    .string()
    .refine(isValidDateAfter1970)
    .optional()
    .describe(
      'The date to retire, as an ISO 8601 date, where the first day of the month is used, for example 2036-01-01. Defaults to the retirement date the user has saved and, if that is absent as well, to 10 years from now.'
    ),
  safeWithdrawalRateInPercentage: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe(
      'The share of the projected amount which is withdrawn per year, in percentage, for example 4 for 4%. It gives the retirement income and defaults to the rate the user has saved.'
    ),
  targetAmount: z
    .number()
    .min(0)
    .optional()
    .describe(
      'The amount the portfolio should reach, in future dollars. If it is given, the horizon of the projection is the time until the amount is reached.'
    )
});

export const GET_ACCOUNTS_PARAMETERS = z.object({
  accountIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MCP_MAX_ACCOUNTS)
    .optional()
    .describe(
      `The identifiers of the accounts to get, at most ${MCP_MAX_ACCOUNTS}`
    ),
  assetClasses: z
    .array(z.enum(AssetClass))
    .min(1)
    .optional()
    .describe('The asset classes of the accounts to get'),
  holding: HOLDING_PARAMETER.optional().describe(
    'The asset profile of the accounts to get'
  )
});

export const GET_ACTIVITIES_PARAMETERS = z.object({
  activityTypes: z
    .array(z.enum(ActivityType))
    .min(1)
    .optional()
    .describe('The types of the activities to get'),
  assetClasses: z
    .array(z.enum(AssetClass))
    .min(1)
    .optional()
    .describe('The asset classes of the activities to get'),
  holding: HOLDING_PARAMETER.optional().describe(
    'The asset profile of the activities to get'
  ),
  range: z
    .string()
    .regex(DATE_RANGE_PATTERN)
    .optional()
    .describe(
      `The date range of the activities to get, either ${DATE_RANGES.join(
        ', '
      )} or a calendar year like 2024`
    ),
  skip: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('The number of activities to skip'),
  take: z
    .number()
    .int()
    .min(1)
    .max(MCP_MAX_ACTIVITIES)
    .default(MCP_MAX_ACTIVITIES)
    .describe(`The number of activities to get, at most ${MCP_MAX_ACTIVITIES}`)
});

export const IMPORT_ACTIVITIES_PARAMETERS = z.object({
  activities: z
    .array(
      z.object({
        accountId: z
          .string()
          .min(1)
          .optional()
          .describe('The identifier of the account of the activity'),
        comment: z.string().optional().describe('The comment of the activity'),
        currency: z
          .string()
          .refine(isValidCurrencyCode)
          .describe(
            'The currency of the fee and of the unit price, as an ISO 4217 code in upper case'
          ),
        dataSource: z
          .enum(DataSource)
          .optional()
          .describe('The data source of the asset profile'),
        date: z
          .string()
          .refine(isValidDateAfter1970)
          .describe(
            'The date of the activity, as an ISO 8601 date or date and time'
          ),
        fee: z.number().min(0).describe('The fee of the activity'),
        quantity: z.number().min(0).describe('The quantity of the activity'),
        symbol: z.string().min(1).describe('The symbol of the asset profile'),
        type: z.enum(ActivityType).describe('The type of the activity'),
        unitPrice: z.number().min(0).describe('The unit price of the activity')
      })
    )
    .min(1)
    .max(MCP_MAX_ACTIVITIES)
    .describe(`The activities to import, at most ${MCP_MAX_ACTIVITIES}`)
});

export const SEARCH_ASSET_PROFILES_PARAMETERS = z.object({
  query: z
    .string()
    .trim()
    .min(SEARCH_QUERY_MINIMUM_LENGTH)
    .max(SEARCH_QUERY_MAXIMUM_LENGTH)
    .describe(
      'The name, ticker symbol or ISIN of the financial asset, for example Apple, AAPL, Bitcoin or US0378331005'
    )
});
