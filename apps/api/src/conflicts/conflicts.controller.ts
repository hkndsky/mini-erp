import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types';
import { pageMeta, toPaging } from '../common/pagination';
import { ConflictsService } from './conflicts.service';
import { ListConflictsQueryDto } from './dtos/list-conflicts.dto';
import { ResolveConflictDto } from './dtos/resolve-conflict.dto';

@Controller('conflicts')
export class ConflictsController {
  constructor(private readonly conflicts: ConflictsService) {}

  @Get()
  async list(@Query() query: ListConflictsQueryDto) {
    const { page, pageSize } = toPaging(query);
    const { data, total } = await this.conflicts.list(query);
    return { data, meta: pageMeta(page, pageSize, total) };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.conflicts.get(id);
  }

  @Post(':id/resolve')
  @Roles('ADMIN', 'WAREHOUSE')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveConflictDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conflicts.resolve(id, dto, user.email);
  }
}
