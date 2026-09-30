import { DataSource } from '@prisma/client';

import { SymbolProfileService } from './symbol-profile.service';

describe('SymbolProfileService', () => {
  it('exposes a manual ticker Yahoo Finance connection without its internal anchor', async () => {
    const prismaService = {
      symbolProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            _count: { activities: 0, watchedBy: 0 },
            activities: [],
            assetClass: null,
            assetProfileOverrides: null,
            assetProfileSplits: [],
            assetSubClass: null,
            comment: null,
            countries: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            currency: 'USD',
            cusip: null,
            dataGatheringFrequency: 'DAILY',
            dataSource: DataSource.MANUAL,
            figi: null,
            figiComposite: null,
            figiShareClass: null,
            holdings: null,
            id: 'manual-profile-id',
            isActive: true,
            isin: null,
            manualTickerYahooFinanceConnection: {
              anchorDate: new Date('2026-01-02T00:00:00.000Z'),
              anchorMarketPrice: 100,
              anchorYahooMarketPrice: 200,
              beta: 1.5,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              symbol: 'SPY',
              symbolProfileId: 'manual-profile-id',
              updatedAt: new Date('2026-01-01T00:00:00.000Z')
            },
            name: 'Manual asset',
            scraperConfiguration: null,
            sectors: null,
            symbol: 'manual-symbol',
            symbolMapping: null,
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            url: null,
            userId: 'user-id'
          }
        ])
      }
    };
    const symbolProfileService = new SymbolProfileService(prismaService as any);

    const [assetProfile] = await symbolProfileService.getSymbolProfiles([
      { dataSource: DataSource.MANUAL, symbol: 'manual-symbol' }
    ]);

    expect(assetProfile.yahooFinanceConnection).toEqual({
      beta: 1.5,
      symbol: 'SPY'
    });
    expect(assetProfile).not.toHaveProperty(
      'manualTickerYahooFinanceConnection'
    );
  });
});
