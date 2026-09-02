import { IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/pagination';

export class ListConflictsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED_APPLIED', 'RESOLVED_DISCARDED'])
  status?: string;

  @IsOptional()
  @IsIn(['INVENTORY', 'ORDER'])
  entityType?: string;
}
