import { DateRangeFilterDto } from '@ghostfolio/api/dtos/date-range-filter.dto';

import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class GetPerformanceDto extends DateRangeFilterDto {
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => {
    return value === 'true';
  })
  includeCash = false;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsBoolean()
  @Transform(({ value }: TransformFnParams) => {
    return value === 'true';
  })
  withExcludedAccounts? = false;
}
