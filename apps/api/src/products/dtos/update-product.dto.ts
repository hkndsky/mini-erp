import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  supplierCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsString()
  location?: string;
}
