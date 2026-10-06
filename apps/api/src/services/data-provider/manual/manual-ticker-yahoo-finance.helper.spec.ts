import {
  calculatePreviousSyntheticMarketPrice,
  calculateSyntheticMarketPrice
} from './manual-ticker-yahoo-finance.helper';

describe('calculateSyntheticMarketPrice', () => {
  it('applies the Yahoo return scaled by beta to the previous synthetic price', () => {
    expect(
      calculateSyntheticMarketPrice({
        beta: 1.5,
        previousSyntheticMarketPrice: 100,
        previousYahooMarketPrice: 200,
        yahooMarketPrice: 220
      })
    ).toBe(115);
  });

  it('supports a zero beta', () => {
    expect(
      calculateSyntheticMarketPrice({
        beta: 0,
        previousSyntheticMarketPrice: 100,
        previousYahooMarketPrice: 200,
        yahooMarketPrice: 150
      })
    ).toBe(100);
  });

  it('supports a negative beta', () => {
    expect(
      calculateSyntheticMarketPrice({
        beta: -1,
        previousSyntheticMarketPrice: 100,
        previousYahooMarketPrice: 100,
        yahooMarketPrice: 110
      })
    ).toBe(90);
  });

  it('inverts the beta-scaled Yahoo return to derive an earlier synthetic price', () => {
    const nextSyntheticMarketPrice = calculateSyntheticMarketPrice({
      beta: 1.5,
      previousSyntheticMarketPrice: 100,
      previousYahooMarketPrice: 200,
      yahooMarketPrice: 220
    });

    expect(
      calculatePreviousSyntheticMarketPrice({
        beta: 1.5,
        nextSyntheticMarketPrice,
        nextYahooMarketPrice: 220,
        yahooMarketPrice: 200
      })
    ).toBeCloseTo(100, 12);
  });

  it('returns no earlier price when the forward return factor is zero', () => {
    expect(
      calculatePreviousSyntheticMarketPrice({
        beta: 2,
        nextSyntheticMarketPrice: 100,
        nextYahooMarketPrice: 100,
        yahooMarketPrice: 200
      })
    ).toBeUndefined();
  });
});
