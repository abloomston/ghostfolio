import { DateRangeFilterDto } from '@ghostfolio/api/dtos/date-range-filter.dto';

import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class GetDetailsDto extends DateRangeFilterDto {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => {
    return value === 'true';
  })
  includeCash = false;

  @IsBoolean()
  @Transform(({ value }: TransformFnParams) => {
    return value === 'true';
  })
  withMarkets? = false;
}
