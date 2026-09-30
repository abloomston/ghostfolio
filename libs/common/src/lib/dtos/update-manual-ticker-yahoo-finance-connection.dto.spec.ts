import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';

import { UpdateManualTickerYahooFinanceConnectionDto } from './update-manual-ticker-yahoo-finance-connection.dto';

describe('UpdateManualTickerYahooFinanceConnectionDto', () => {
  it('accepts a connection and an explicit disconnect', async () => {
    await expect(
      validate(
        plainToInstance(UpdateManualTickerYahooFinanceConnectionDto, {
          yahooFinanceConnection: { beta: 1.5, symbol: 'SPY' }
        })
      )
    ).resolves.toHaveLength(0);

    await expect(
      validate(
        plainToInstance(UpdateManualTickerYahooFinanceConnectionDto, {
          yahooFinanceConnection: null
        })
      )
    ).resolves.toHaveLength(0);
  });

  it('rejects an invalid beta', async () => {
    await expect(
      validate(
        plainToInstance(UpdateManualTickerYahooFinanceConnectionDto, {
          yahooFinanceConnection: {
            beta: Number.POSITIVE_INFINITY,
            symbol: 'SPY'
          }
        })
      )
    ).resolves.not.toHaveLength(0);
  });
});
