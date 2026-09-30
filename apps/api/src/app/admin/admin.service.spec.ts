import { DataSource } from '@prisma/client';

import { AdminService } from './admin.service';

jest.mock(
  '@ghostfolio/api/services/data-provider/manual/manual.service',
  () => ({
    ManualService: class {}
  })
);

describe('AdminService', () => {
  it('removes a Yahoo Finance connection when converting a manual ticker', async () => {
    const manualTickerYahooFinanceConnection = { deleteMany: jest.fn() };
    const marketDataService = {
      updateAssetProfileIdentifier: jest.fn().mockReturnValue({})
    };
    const prismaService = {
      $transaction: jest.fn().mockResolvedValue(undefined),
      manualTickerYahooFinanceConnection
    };
    const symbolProfileService = {
      getSymbolProfiles: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { dataSource: DataSource.YAHOO, symbol: 'AAPL' }
        ]),
      updateAssetProfileIdentifier: jest.fn().mockReturnValue({})
    };
    const adminService = new AdminService(
      null,
      null,
      null,
      null,
      null,
      marketDataService as any,
      prismaService as any,
      null,
      symbolProfileService as any
    );

    await adminService.patchAssetProfileData(
      { dataSource: DataSource.MANUAL, symbol: 'manual-symbol' },
      { dataSource: DataSource.YAHOO, symbol: 'AAPL' }
    );

    expect(manualTickerYahooFinanceConnection.deleteMany).toHaveBeenCalledWith({
      where: {
        symbolProfile: {
          dataSource: DataSource.MANUAL,
          symbol: 'manual-symbol'
        }
      }
    });
  });
});
