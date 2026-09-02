import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  sku!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  supplierCode?: string;

  @IsOptional()
  @Min(0)
  @IsInt()
  unitCost?: number;

  @IsOptional()
  @Min(0)
  @IsInt()
  defaultPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityOnHand?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reorderPoint?: number;

  @IsOptional()
  @IsString()
  location?: string;
}
