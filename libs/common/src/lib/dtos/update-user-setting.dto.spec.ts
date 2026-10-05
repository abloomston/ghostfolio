import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';

import { UpdateUserSettingDto } from './update-user-setting.dto';

describe('UpdateUserSettingDto', () => {
  it('accepts a numeric cash interest rate', async () => {
    await expect(
      validate(
        plainToInstance(UpdateUserSettingDto, { cashInterestRate: 4.25 })
      )
    ).resolves.toHaveLength(0);
  });

  it('rejects a non-numeric cash interest rate', async () => {
    await expect(
      validate(
        plainToInstance(UpdateUserSettingDto, { cashInterestRate: '4.25' })
      )
    ).resolves.not.toHaveLength(0);
  });
});
