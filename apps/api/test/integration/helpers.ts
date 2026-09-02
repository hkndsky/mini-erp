import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { Role } from '@prisma/client';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

/**
 * All Prisma-managed tables, children first so CASCADE can do its job.
 * (The raw legacy_inventory table is intentionally left alone.)
 */
// Prisma table names are quoted identifiers; "Order" is a reserved word.
const ALL_TABLES = [
  '"ReconciliationConflict"',
  '"AuditLog"',
  '"ImportBatch"',
  '"OrderItem"',
  '"Order"',
  '"StockItem"',
  '"Product"',
  '"Supplier"',
  '"User"',
];

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export const PASSWORD = 'Password123!';

export async function seedUser(
  prisma: PrismaService,
  input: { name: string; email: string; role: Role },
): Promise<void> {
  await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: bcrypt.hashSync(PASSWORD, 10),
    },
  });
}

export async function login(
  app: INestApplication,
  email: string,
  password: string = PASSWORD,
): Promise<{ accessToken: string; user: { id: string; role: Role } }> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });
  if (res.status !== 201) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}
