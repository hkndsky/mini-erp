import { Controller, Get, Query } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';

class TrendQueryDto {
  @IsOptional()
  @Min(7)
  @Max(365)
  @IsInt()
  days?: number;
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary() {
    return this.reports.summary();
  }

  @Get('low-stock')
  @Roles('ADMIN', 'WAREHOUSE')
  lowStock() {
    return this.reports.lowStock();
  }

  @Get('order-trend')
  orderTrend(@Query() query: TrendQueryDto) {
    return this.reports.orderTrend(query.days ?? 30);
  }
}
