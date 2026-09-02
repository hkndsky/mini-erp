import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Delete,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types';
import { pageMeta } from '../common/pagination';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dtos/create-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { ListProductsQueryDto } from './dtos/list-products.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  async list(@Query() query: ListProductsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const { data, total, page, pageSize } = await this.products.list(query, user.role);
    return { data, meta: pageMeta(page, pageSize, total) };
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.products.get(id, user.role);
  }

  @Post()
  @Roles('ADMIN', 'WAREHOUSE')
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthenticatedUser) {
    return this.products.create(dto, user.email);
  }

  @Post(':id')
  @Roles('ADMIN', 'WAREHOUSE')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.products.update(id, dto, user.email);
  }

  @Delete(':id')
  @Roles('ADMIN', 'WAREHOUSE')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.products.remove(id, user.email);
  }
}
