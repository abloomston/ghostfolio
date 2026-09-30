import { DataSource } from '@prisma/client';

import { ManualService } from './manual.service';

jest.mock('@ghostfolio/api/app/redis-cache/redis-cache.service', () => ({
  RedisCacheService: class {}
}));
jest.mock(
  '@ghostfolio/api/services/configuration/configuration.service',
  () => ({
    ConfigurationService: class {}
  })
);
jest.mock(
  '@ghostfolio/api/services/data-provider/yahoo-finance/yahoo-finance.service',
  () => ({
    YahooFinanceService: class {}
  })
);
jest.mock('@ghostfolio/api/services/fetch/fetch.service', () => ({
  FetchService: class {}
}));
jest.mock(
  '@ghostfolio/api/services/symbol-profile/symbol-profile.service',
  () => ({
    SymbolProfileService: class {}
  })
);

describe('ManualService', () => {
  const connection = {
    anchorDate: new Date('2026-01-02T00:00:00.000Z'),
    anchorMarketPrice: 100,
    anchorYahooMarketPrice: 100,
    beta: 1.5,
    createdAt: new Date(),
    symbol: 'SPY',
    symbolProfileId: 'manual-profile-id',
    updatedAt: new Date()
  };

  let manualService: ManualService;
  let prismaService: {
    manualTickerYahooFinanceConnection: {
      deleteMany: jest.Mock;
      upsert: jest.Mock;
    };
    marketData: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    order: { findFirst: jest.Mock };
    symbolProfile: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let redisCacheService: { getQuoteKey: jest.Mock; remove: jest.Mock };
  let yahooFinanceService: {
    getHistorical: jest.Mock;
    getQuotes: jest.Mock;
  };

  beforeEach(() => {
    prismaService = {
      manualTickerYahooFinanceConnection: {
        deleteMany: jest.fn(),
        upsert: jest.fn()
      },
      marketData: {
        findFirst: jest.fn(),
        findMany: jest.fn()
      },
      order: { findFirst: jest.fn() },
      symbolProfile: {
        findMany: jest.fn(),
        findUnique: jest.fn()
      }
    };
    redisCacheService = {
      getQuoteKey: jest.fn().mockReturnValue('quote-MANUAL-manual-symbol'),
      remove: jest.fn()
    };
    yahooFinanceService = {
      getHistorical: jest.fn(),
      getQuotes: jest.fn()
    };
    manualService = new ManualService(
      null,
      null,
      prismaService as any,
      redisCacheService as any,
      null,
      yahooFinanceService as any
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getHistorical', () => {
    it('builds daily synthetic prices from scaled Yahoo returns', async () => {
      prismaService.symbolProfile.findUnique.mockResolvedValue({
        manualTickerYahooFinanceConnection: connection
      });
      prismaService.marketData.findFirst.mockResolvedValue(undefined);
      yahooFinanceService.getHistorical.mockResolvedValue({
        '2026-01-02': { marketPrice: 100 },
        '2026-01-05': { marketPrice: 110 }
      });

      const result = await manualService.getHistorical({
        from: new Date('2026-01-02T00:00:00.000Z'),
        symbol: 'manual-symbol',
        to: new Date('2026-01-05T00:00:00.000Z')
      });

      expect(result).toEqual({
        '2026-01-02': { marketPrice: 100 },
        '2026-01-03': { marketPrice: 100 },
        '2026-01-04': { marketPrice: 100 },
        '2026-01-05': { marketPrice: 115 }
      });
    });

    it('uses the stored synthetic price before a recent gathering range', async () => {
      prismaService.symbolProfile.findUnique.mockResolvedValue({
        manualTickerYahooFinanceConnection: connection
      });
      prismaService.marketData.findFirst.mockResolvedValue({
        date: new Date('2026-01-05T00:00:00.000Z'),
        marketPrice: 115
      });
      yahooFinanceService.getHistorical.mockResolvedValue({
        '2026-01-05': { marketPrice: 110 },
        '2026-01-06': { marketPrice: 99 }
      });

      const result = await manualService.getHistorical({
        from: new Date('2026-01-06T00:00:00.000Z'),
        symbol: 'manual-symbol',
        to: new Date('2026-01-06T00:00:00.000Z')
      });

      expect(result).toEqual({
        '2026-01-06': { marketPrice: 97.75 }
      });
    });
  });

  describe('getQuotes', () => {
    it('derives a current manual quote from the Yahoo quote and prior close', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-06T14:00:00.000Z'));
      prismaService.symbolProfile.findMany.mockResolvedValue([
        {
          currency: 'USD',
          manualTickerYahooFinanceConnection: connection,
          symbol: 'manual-symbol'
        }
      ]);
      prismaService.marketData.findMany.mockResolvedValue([]);
      prismaService.marketData.findFirst.mockResolvedValue({
        date: new Date('2026-01-05T00:00:00.000Z'),
        marketPrice: 115
      });
      yahooFinanceService.getQuotes.mockResolvedValue({
        SPY: {
          currency: 'USD',
          dataSource: DataSource.YAHOO,
          marketPrice: 99,
          marketState: 'open'
        }
      });
      yahooFinanceService.getHistorical.mockResolvedValue({
        '2026-01-05': { marketPrice: 110 }
      });

      await expect(
        manualService.getQuotes({ symbols: ['manual-symbol'] })
      ).resolves.toEqual({
        'manual-symbol': {
          currency: 'USD',
          dataSource: DataSource.MANUAL,
          marketPrice: 97.75,
          marketState: 'open'
        }
      });
    });
  });

  describe('updateYahooFinanceConnection', () => {
    it('stores an anchor based on the manual price and prior Yahoo close', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-06T14:00:00.000Z'));
      prismaService.marketData.findFirst.mockResolvedValue({ marketPrice: 50 });
      yahooFinanceService.getHistorical.mockResolvedValue({
        '2026-01-05': { marketPrice: 200 }
      });

      await manualService.updateYahooFinanceConnection({
        beta: 1.2,
        symbol: 'manual-symbol',
        symbolProfileId: 'manual-profile-id',
        yahooSymbol: ' SPY '
      });

      expect(
        prismaService.manualTickerYahooFinanceConnection.upsert
      ).toHaveBeenCalledWith({
        create: {
          anchorDate: new Date('2026-01-05T00:00:00.000Z'),
          anchorMarketPrice: 50,
          anchorYahooMarketPrice: 200,
          beta: 1.2,
          symbol: 'SPY',
          symbolProfileId: 'manual-profile-id'
        },
        update: {
          anchorDate: new Date('2026-01-05T00:00:00.000Z'),
          anchorMarketPrice: 50,
          anchorYahooMarketPrice: 200,
          beta: 1.2,
          symbol: 'SPY'
        },
        where: { symbolProfileId: 'manual-profile-id' }
      });
      expect(redisCacheService.getQuoteKey).toHaveBeenCalledWith({
        dataSource: DataSource.MANUAL,
        symbol: 'manual-symbol'
      });
      expect(redisCacheService.remove).toHaveBeenCalledWith(
        'quote-MANUAL-manual-symbol'
      );
    });
  });
});
