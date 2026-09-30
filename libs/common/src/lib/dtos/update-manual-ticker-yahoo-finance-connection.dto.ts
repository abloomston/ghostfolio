import { SYMBOL_MAXIMUM_LENGTH } from '@ghostfolio/common/config';

import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator';

class YahooFinanceConnectionDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  beta: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(SYMBOL_MAXIMUM_LENGTH)
  symbol: string;
}

export class UpdateManualTickerYahooFinanceConnectionDto {
  @IsObject()
  @IsOptional()
  @Type(() => YahooFinanceConnectionDto)
  @ValidateNested()
  yahooFinanceConnection?: YahooFinanceConnectionDto | null;
}
