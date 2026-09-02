import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { StockModule } from './stock/stock.module';
import { OrdersModule } from './orders/orders.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { ImportsModule } from './imports/imports.module';
import { ConflictsModule } from './conflicts/conflicts.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          JWT_SECRET: process.env.JWT_SECRET ?? 'dev-insecure-jwt-secret',
        }),
      ],
    }),
    PrismaModule,
    AuthModule,
    ProductsModule,
    SuppliersModule,
    StockModule,
    OrdersModule,
    ReconciliationModule,
    ImportsModule,
    ConflictsModule,
    ReportsModule,
    AuditModule,
    SyncModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
