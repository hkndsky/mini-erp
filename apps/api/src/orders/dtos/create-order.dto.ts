import {
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /**
   * Sales may NOT pass a price (server uses product defaultPrice).
   * Warehouse/Admin may override it.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CreateOrderDto {
  @IsString()
  @MinLength(2)
  customerName!: string;

  @ValidateNested()
  @Type(() => OrderItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  items!: OrderItemDto[];
}
