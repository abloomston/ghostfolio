import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';

import { CreateOrderDto } from './create-order.dto';

describe('CreateOrderDto mortgage fields', () => {
  const base = {
    currency: 'USD',
    date: '2024-01-01T00:00:00.000Z',
    fee: 0,
    quantity: 1,
    symbol: 'MORTGAGE',
    type: 'LIABILITY',
    unitPrice: 300000
  };
  const validMortgage = {
    mortgageInterestRate: 5,
    mortgageStartDate: '2024-01-01T00:00:00.000Z',
    mortgageTermYears: 30
  };

  it('accepts a complete set of mortgage terms', async () => {
    await expect(
      validate(plainToInstance(CreateOrderDto, { ...base, ...validMortgage }))
    ).resolves.toHaveLength(0);
  });

  it('accepts an activity without mortgage terms', async () => {
    await expect(
      validate(plainToInstance(CreateOrderDto, base))
    ).resolves.toHaveLength(0);
  });

  it('rejects a mortgage term other than 15 or 30 years', async () => {
    await expect(
      validate(
        plainToInstance(CreateOrderDto, {
          ...base,
          ...validMortgage,
          mortgageTermYears: 20
        })
      )
    ).resolves.not.toHaveLength(0);
  });

  it('rejects a negative mortgage interest rate', async () => {
    await expect(
      validate(
        plainToInstance(CreateOrderDto, {
          ...base,
          ...validMortgage,
          mortgageInterestRate: -1
        })
      )
    ).resolves.not.toHaveLength(0);
  });
});
