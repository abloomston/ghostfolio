import { DateRangeFilterDto } from '@ghostfolio/api/dtos/date-range-filter.dto';
import { GroupBy } from '@ghostfolio/common/types';

import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class GetInvestmentsDto extends DateRangeFilterDto {
  @IsIn(['month', 'year'] as GroupBy[])
  @IsOptional()
  groupBy?: GroupBy;

  @IsBoolean()
  @Transform(({ value }: TransformFnParams) => {
    return value === 'true';
  })
  excludeDebits = true;
}
