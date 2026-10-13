import {
  FIRE_MAX_PROJECTION_YEARS,
  MCP_MAX_ACTIVITIES,
  MCP_MAX_ONE_TIME_SAVINGS,
  SEARCH_QUERY_MAXIMUM_LENGTH,
  SEARCH_QUERY_MINIMUM_LENGTH
} from '@ghostfolio/common/config';

import { z } from 'zod';

import {
  CALCULATE_FIRE_PROJECTION_PARAMETERS,
  IMPORT_ACTIVITIES_PARAMETERS,
  SEARCH_ASSET_PROFILES_PARAMETERS
} from './mcp.schemas';
import { createActivity } from './mcp.test-utils';

describe('CALCULATE_FIRE_PROJECTION_PARAMETERS', () => {
  function parse(
    parameters: Partial<
      z.infer<typeof CALCULATE_FIRE_PROJECTION_PARAMETERS>
    > = {}
  ) {
    return CALCULATE_FIRE_PROJECTION_PARAMETERS.safeParse({
      paymentPerPeriod: 1000,
      principalInvestmentAmount: 100000,
      ...parameters
    }).success;
  }

  it('Accepts the amounts of the calculator', () => {
    expect(parse()).toBe(true);
    expect(parse({ paymentPerPeriod: 0, principalInvestmentAmount: 0 })).toBe(
      true
    );
  });

  // Without the amounts the tool falls back to the portfolio or to 0
  it('Accepts the parameters without the amounts', () => {
    expect(
      CALCULATE_FIRE_PROJECTION_PARAMETERS.safeParse({
        monthsToRetire: 120
      }).success
    ).toBe(true);
  });

  it('Refuses a negative amount', () => {
    expect(parse({ principalInvestmentAmount: -1 })).toBe(false);
    expect(parse({ paymentPerPeriod: -1 })).toBe(false);
    expect(
      parse({ oneTimeSavings: [{ amount: -1, date: '2027-01-01' }] })
    ).toBe(false);
  });

  it('Refuses a rate outside of the range of the calculator', () => {
    expect(parse({ expectedReturnInPercentage: -101 })).toBe(false);
    expect(parse({ expectedReturnInPercentage: 101 })).toBe(false);
    expect(parse({ expectedInflationRateInPercentage: 101 })).toBe(false);
    expect(parse({ safeWithdrawalRateInPercentage: 101 })).toBe(false);
  });

  it(`Refuses more than ${FIRE_MAX_PROJECTION_YEARS * 12} months`, () => {
    expect(parse({ monthsToRetire: FIRE_MAX_PROJECTION_YEARS * 12 })).toBe(
      true
    );
    expect(parse({ monthsToRetire: FIRE_MAX_PROJECTION_YEARS * 12 + 1 })).toBe(
      false
    );
  });

  it(`Refuses more than ${MCP_MAX_ONE_TIME_SAVINGS} one-time savings`, () => {
    expect(
      parse({
        oneTimeSavings: Array.from(
          { length: MCP_MAX_ONE_TIME_SAVINGS + 1 },
          () => {
            return { amount: 1000 };
          }
        )
      })
    ).toBe(false);
  });

  it('Refuses a date which is not valid', () => {
    expect(parse({ retirementDate: 'not-a-date' })).toBe(false);
    expect(parse({ retirementDate: '2027-01-01' })).toBe(true);
    expect(parse({ oneTimeSavings: [{ amount: 1000 }] })).toBe(true);
  });

  it('Refuses an empty list of one-time savings', () => {
    expect(parse({ oneTimeSavings: [] })).toBe(false);
  });
});

describe('IMPORT_ACTIVITIES_PARAMETERS', () => {
  function parse(activities: unknown[]) {
    return IMPORT_ACTIVITIES_PARAMETERS.safeParse({ activities }).success;
  }

  it('Refuses a currency in lower case', () => {
    expect(parse([createActivity({ currency: 'usd' })])).toBe(false);
  });

  it('Accepts a currency in upper case', () => {
    expect(parse([createActivity({ currency: 'USD' })])).toBe(true);
  });

  it('Refuses a date at or before the epoch', () => {
    expect(parse([createActivity({ date: '0000-01-01' })])).toBe(false);
  });

  it('Refuses an empty symbol', () => {
    expect(parse([createActivity({ symbol: '' })])).toBe(false);
  });

  it('Refuses an empty identifier of an account', () => {
    expect(parse([createActivity({ accountId: '' })])).toBe(false);
  });

  it('Removes a tag, because the tool takes no tag', () => {
    expect(
      IMPORT_ACTIVITIES_PARAMETERS.parse({
        activities: [{ ...createActivity(), tags: ['tag-id'] }]
      }).activities[0]
    ).not.toHaveProperty('tags');
  });

  it(`Refuses more than ${MCP_MAX_ACTIVITIES} activities`, () => {
    expect(
      parse(
        Array.from({ length: MCP_MAX_ACTIVITIES + 1 }, () => {
          return createActivity();
        })
      )
    ).toBe(false);
  });
});

describe('SEARCH_ASSET_PROFILES_PARAMETERS', () => {
  it('Refuses a query that contains only spaces', () => {
    expect(
      SEARCH_ASSET_PROFILES_PARAMETERS.safeParse({ query: '  ' }).success
    ).toBe(false);
  });

  it(`Refuses a query shorter than ${SEARCH_QUERY_MINIMUM_LENGTH} characters`, () => {
    expect(
      SEARCH_ASSET_PROFILES_PARAMETERS.safeParse({ query: 'A' }).success
    ).toBe(false);
  });

  it(`Refuses a query longer than ${SEARCH_QUERY_MAXIMUM_LENGTH} characters`, () => {
    expect(
      SEARCH_ASSET_PROFILES_PARAMETERS.safeParse({
        query: 'A'.repeat(SEARCH_QUERY_MAXIMUM_LENGTH + 1)
      }).success
    ).toBe(false);
  });

  it('Accepts a name, symbol or ISIN', () => {
    for (const query of ['Apple', 'AAPL', 'US0378331005']) {
      expect(
        SEARCH_ASSET_PROFILES_PARAMETERS.safeParse({ query }).success
      ).toBe(true);
    }
  });

  it('Removes spaces at the start and the end of a query', () => {
    expect(
      SEARCH_ASSET_PROFILES_PARAMETERS.parse({ query: ' Apple ' }).query
    ).toBe('Apple');
  });
});
