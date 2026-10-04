import { DateRangeFilterDto } from '@ghostfolio/api/dtos/date-range-filter.dto';
import { SEARCH_QUERY_MAXIMUM_LENGTH } from '@ghostfolio/common/config';
import { HoldingType } from '@ghostfolio/common/types';

import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class GetHoldingsDto extends DateRangeFilterDto {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => {
    return value === 'true';
  })
  includeCash = false;

  @IsIn(['ACTIVE', 'CLOSED'] as HoldingType[])
  @IsOptional()
  holdingType?: HoldingType;

  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_QUERY_MAXIMUM_LENGTH)
  query?: string;
}
