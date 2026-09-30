import { Big } from 'big.js';

export function calculateSyntheticMarketPrice({
  beta,
  previousSyntheticMarketPrice,
  previousYahooMarketPrice,
  yahooMarketPrice
}: {
  beta: number;
  previousSyntheticMarketPrice: number;
  previousYahooMarketPrice: number;
  yahooMarketPrice: number;
}) {
  const yahooReturn = new Big(yahooMarketPrice)
    .div(previousYahooMarketPrice)
    .minus(1);

  return new Big(previousSyntheticMarketPrice)
    .mul(yahooReturn.mul(beta).plus(1))
    .toNumber();
}
