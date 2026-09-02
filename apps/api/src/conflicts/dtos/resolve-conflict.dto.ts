import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveConflictDto {
  @IsIn(['APPLY_INCOMING', 'KEEP_CURRENT'])
  resolution!: 'APPLY_INCOMING' | 'KEEP_CURRENT';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
