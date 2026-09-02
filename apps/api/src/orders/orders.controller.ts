import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types';
import { pageMeta } from '../common/pagination';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dtos/create-order.dto';
import { ListOrdersQueryDto } from './dtos/list-orders.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async list(@Query() query: ListOrdersQueryDto) {
    const { data, total, page, pageSize } = await this.orders.list(query);
    return { data, meta: pageMeta(page, pageSize, total) };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.create(dto, user.email, user.role);
  }

  @Post(':id/confirm')
  @Roles('ADMIN', 'WAREHOUSE')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.confirm(id, user.email);
  }

  @Post(':id/ship')
  @Roles('ADMIN', 'WAREHOUSE')
  ship(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.ship(id, user.email);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'WAREHOUSE')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.orders.cancel(id, user.email);
  }
}
