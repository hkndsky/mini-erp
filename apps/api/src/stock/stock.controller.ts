import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types';
import { pageMeta } from '../common/pagination';
import { StockService } from './stock.service';
import { ListStockQueryDto } from './dtos/list-stock.dto';
import { AdjustStockDto } from './dtos/adjust-stock.dto';

@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  async list(@Query() query: ListStockQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const { data, total, page, pageSize } = await this.stock.list(query, user.role);
    return { data, meta: pageMeta(page, pageSize, total) };
  }

  @Post(':productId/adjust')
  @Roles('ADMIN', 'WAREHOUSE')
  adjust(
    @Param('productId') productId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stock.adjust(productId, dto, user.email);
  }
}
