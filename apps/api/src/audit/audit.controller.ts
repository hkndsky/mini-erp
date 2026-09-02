import { Controller, Get, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

class AuditQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

@Controller('audit')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query() query: AuditQueryDto) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 100,
    });
  }
}
