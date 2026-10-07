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

export function calculatePreviousSyntheticMarketPrice({
  beta,
  nextSyntheticMarketPrice,
  nextYahooMarketPrice,
  yahooMarketPrice
}: {
  beta: number;
  nextSyntheticMarketPrice: number;
  nextYahooMarketPrice: number;
  yahooMarketPrice: number;
}): number | undefined {
  const yahooReturn = new Big(nextYahooMarketPrice)
    .div(yahooMarketPrice)
    .minus(1);
  const syntheticPriceFactor = yahooReturn.mul(beta).plus(1);

  if (syntheticPriceFactor.eq(0)) {
    return undefined;
  }

  const previousSyntheticMarketPrice = new Big(nextSyntheticMarketPrice)
    .div(syntheticPriceFactor)
    .toNumber();

  return Number.isFinite(previousSyntheticMarketPrice)
    ? previousSyntheticMarketPrice
    : undefined;
}
