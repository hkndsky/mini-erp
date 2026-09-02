import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @Min(-100000)
  delta!: number;

  @IsString()
  @MaxLength(200)
  reason!: string;
}
