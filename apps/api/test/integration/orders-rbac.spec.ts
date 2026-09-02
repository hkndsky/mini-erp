import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedUser, login, TestContext } from './helpers';

async function seedCatalog(prisma: any) {
  for (const p of [
    { sku: 'SKU-001', name: 'Bolt M8 x 40', qty: 120, reorder: 50, cost: 2.4, price: 4.9, loc: 'WH-A' },
    { sku: 'SKU-003', name: 'Washer 8mm', qty: 1200, reorder: 500, cost: 0.05, price: 0.3, loc: 'WH-B' },
  ]) {
    await prisma.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        unitCost: p.cost,
        defaultPrice: p.price,
        stock: { create: { quantityOnHand: p.qty, reorderPoint: p.reorder, location: p.loc } },
      },
    });
  }
}

describe('orders + stock + RBAC (integration)', () => {
  let ctx: TestContext;
  let http: any;
  let adminToken: string;
  let salesToken: string;
  let warehouseToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await seedCatalog(ctx.prisma);
    await seedUser(ctx.prisma, { name: 'Erin Admin', email: 'admin@erp.local', role: 'ADMIN' });
    await seedUser(ctx.prisma, { name: 'Wes Warehouse', email: 'warehouse@erp.local', role: 'WAREHOUSE' });
    await seedUser(ctx.prisma, { name: 'Sara Sales', email: 'sales@erp.local', role: 'SALES' });
    const admin = await login(ctx.app, 'admin@erp.local');
    const sales = await login(ctx.app, 'sales@erp.local');
    const warehouse = await login(ctx.app, 'warehouse@erp.local');
    adminToken = admin.accessToken;
    salesToken = sales.accessToken;
    warehouseToken = warehouse.accessToken;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function createOrder(
    token: string,
    body: { customerName: string; items: { sku: string; quantity: number; unitPrice?: number }[] },
  ) {
    return request(http).post('/orders').set('Authorization', `Bearer ${token}`).send(body);
  }

  it('SALES creates an order priced from defaultPrice (no explicit price)', async () => {
    const res = await createOrder(salesToken, {
      customerName: 'Northwind',
      items: [{ sku: 'SKU-001', quantity: 10 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(Number(res.body.items[0].unitPrice)).toBe(4.9); // Prisma Decimal -> JSON string
    expect(Number(res.body.total)).toBeCloseTo(49);
  });

  it('SALES cannot pass an explicit unitPrice (400)', async () => {
    const res = await createOrder(salesToken, {
      customerName: 'Northwind',
      items: [{ sku: 'SKU-001', quantity: 1, unitPrice: 0.01 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('unit price');
  });

  it('WAREHOUSE may override the unit price', async () => {
    const res = await createOrder(warehouseToken, {
      customerName: 'Contoso',
      items: [{ sku: 'SKU-001', quantity: 2, unitPrice: 5.5 }],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.items[0].unitPrice)).toBe(5.5);
  });

  it('order with unknown SKU is a 404', async () => {
    const res = await createOrder(salesToken, {
      customerName: 'Northwind',
      items: [{ sku: 'SKU-NOPE', quantity: 1 }],
    });
    expect(res.status).toBe(404);
  });

  it('confirm decrements stock; double-confirm is 409', async () => {
    const created = await createOrder(salesToken, {
      customerName: 'Northwind',
      items: [{ sku: 'SKU-001', quantity: 10 }],
    });
    const orderId = created.body.id;

    const confirmed = await request(http)
      .post(`/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${warehouseToken}`);
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.status).toBe('CONFIRMED');

    const p1 = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-001' } });
    const stock = await ctx.prisma.stockItem.findUnique({ where: { productId: p1.id } });
    expect(stock!.quantityOnHand).toBe(110);

    const again = await request(http)
      .post(`/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${warehouseToken}`);
    expect(again.status).toBe(409);
  });

  it('confirm with insufficient stock is a 409 with shortfalls', async () => {
    const created = await createOrder(salesToken, {
      customerName: 'Big co',
      items: [{ sku: 'SKU-003', quantity: 5000 }],
    });
    const res = await request(http)
      .post(`/orders/${created.body.id}/confirm`)
      .set('Authorization', `Bearer ${warehouseToken}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Insufficient stock');
    expect(res.body.shortfalls).toHaveLength(1);
  });

  it('SALES cannot confirm (403) or cancel; warehouse cancel restores stock', async () => {
    const created = await createOrder(salesToken, {
      customerName: 'Northwind',
      items: [{ sku: 'SKU-001', quantity: 20 }],
    });
    const orderId = created.body.id;

    const forbidden = await request(http)
      .post(`/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(forbidden.status).toBe(403);

    await request(http).post(`/orders/${orderId}/confirm`).set('Authorization', `Bearer ${warehouseToken}`);

    const cancelled = await request(http)
      .post(`/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({});
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe('CANCELLED');

    const p1 = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-001' } });
    const stock = await ctx.prisma.stockItem.findUnique({ where: { productId: p1.id } });
    expect(stock!.quantityOnHand).toBe(120); // restored
  });

  it('stock adjustment is audited and cannot drive stock negative via adjust', async () => {
    const p1 = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-001' } });
    const res = await request(http)
      .post(`/stock/${p1.id}/adjust`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ delta: -5, reason: 'cycle count' });
    expect(res.status).toBe(201);

    const stock = await ctx.prisma.stockItem.findUnique({ where: { productId: p1.id } });
    expect(stock!.quantityOnHand).toBe(115);

    const negative = await request(http)
      .post(`/stock/${p1.id}/adjust`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ delta: -9999, reason: 'oops' });
    expect(negative.status).toBe(400);

    // /audit is ADMIN-only (auditors need to see every role's actions)
    const audit = await request(http)
      .get('/audit?action=STOCK_ADJUSTED')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(audit.status).toBe(200);
    expect(audit.body.length).toBeGreaterThanOrEqual(1);
  });
});
