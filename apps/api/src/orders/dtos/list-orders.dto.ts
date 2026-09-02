import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export class ListOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED'])
  status?: string;
}
