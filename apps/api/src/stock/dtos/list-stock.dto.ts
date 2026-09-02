import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export class ListStockQueryDto extends PaginationQueryDto {
  /** "true" | "false" as strings: query params arrive as strings and implicit
   * boolean conversion would treat "false" as truthy. */
  @IsOptional()
  @IsIn(['true', 'false'])
  lowOnly?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
