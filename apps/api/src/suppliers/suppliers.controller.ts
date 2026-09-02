import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types';
import { PaginationQueryDto, pageMeta, toPaging } from '../common/pagination';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dtos/supplier.dto';

@Controller('suppliers')
@Roles('ADMIN', 'WAREHOUSE')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  async list(@Query() query: PaginationQueryDto) {
    const { page, pageSize } = toPaging(query);
    const [data, total] = await this.suppliers.list(page, pageSize);
    return { data, meta: pageMeta(page, pageSize, total) };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.suppliers.get(id);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Post(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.suppliers.remove(id);
  }
}
