import { IsOptional, IsString, Matches } from 'class-validator';

const MONTH_FROM_1900 = /^(19\d{2}|2\d{3})-(0[1-9]|1[0-2])$/;
const MONTH_MESSAGE = '$property must be in YYYY-MM format';

export class CostSummaryQueryDto {
  /** First month, inclusive. Default: 11 months before `to`. */
  @IsOptional()
  @IsString()
  @Matches(MONTH_FROM_1900, { message: MONTH_MESSAGE })
  from?: string;

  /** Last month, inclusive. Default: the current UTC month. */
  @IsOptional()
  @IsString()
  @Matches(MONTH_FROM_1900, { message: MONTH_MESSAGE })
  to?: string;
}
