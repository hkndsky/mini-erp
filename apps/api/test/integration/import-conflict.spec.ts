import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import {
  createTestApp,
  resetDb,
  seedUser,
  login,
  TestContext,
} from './helpers';
import sampleCsv from '../fixtures/sample-import.csv?raw';

describe('CSV import -> reconciliation -> conflict resolution (integration)', () => {
  let ctx: TestContext;
  let http: any;
  let adminToken: string;
  let salesToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await seedUser(ctx.prisma, { name: 'Erin Admin', email: 'admin@erp.local', role: 'ADMIN' });
    await seedUser(ctx.prisma, { name: 'Sara Sales', email: 'sales@erp.local', role: 'SALES' });

    for (const p of [
      { sku: 'SKU-001', name: 'Bolt M8 x 40', category: 'BOLTS', unitCost: 2.4, defaultPrice: 4.9, qty: 120, reorder: 50 },
      { sku: 'SKU-002', name: 'Nut M8 Zinc', category: 'NUTS', unitCost: 1.1, defaultPrice: 2.5, qty: 85, reorder: 40 },
    ]) {
      await ctx.prisma.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          category: p.category,
          unitCost: p.unitCost,
          defaultPrice: p.defaultPrice,
          stock: { create: { quantityOnHand: p.qty, reorderPoint: p.reorder, location: 'WH-A' } },
        },
      });
    }

    const admin = await login(ctx.app, 'admin@erp.local');
    adminToken = admin.accessToken;
    const sales = await login(ctx.app, 'sales@erp.local');
    salesToken = sales.accessToken;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('full flow: import -> 2 qty conflicts + 3 applied -> resolve -> stock updated + audited', async () => {
    // 1. import the sample CSV
    const imp = await request(http)
      .post('/imports/csv')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(sampleCsv), 'sample-import.csv');
    expect(imp.status).toBe(201);
    const batch = imp.body;
    expect(batch.status).toBe('COMPLETED');
    expect(batch.totalRecords).toBe(3);
    expect(batch.applied).toBe(3); // 2x unitCost LWW + 1 new product
    expect(batch.conflicts).toBe(2); // 2x quantityOnHand FLAG_FOR_REVIEW
    expect(batch.errors ?? []).toHaveLength(0);

    // 2. costs were applied last-write-wins (beyond 1% tolerance)
    const p1 = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-001' } });
    const p2 = await ctx.prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-002' } });
    expect(Number(p1.unitCost)).toBeCloseTo(2.45);
    expect(Number(p2.unitCost)).toBeCloseTo(1.12);

    // 3. unknown SKU became a product with stock
    const p5 = await ctx.prisma.product.findUnique({
      where: { sku: 'SKU-005' },
      include: { stock: true },
    });
    expect(p5).not.toBeNull();
    expect(p5!.stock!.quantityOnHand).toBe(25);

    // 4. open conflicts: exactly the two quantity divergences
    const conf = await request(http)
      .get('/conflicts?status=OPEN&entityType=INVENTORY')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(conf.status).toBe(200);
    expect(conf.body.meta.total).toBe(2);
    const bySku = new Map(conf.body.data.map((c: any) => [c.entityKey, c]));
    expect(bySku.get('SKU-001')!.field).toBe('quantityOnHand');
    expect(bySku.get('SKU-001')!.incomingValue).toBe('130');
    expect(bySku.get('SKU-002')!.incomingValue).toBe('80');

    // 5. SALES may look but not resolve
    const forbidden = await request(http)
      .post(`/conflicts/${bySku.get('SKU-001')!.id}/resolve`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ resolution: 'APPLY_INCOMING' });
    expect(forbidden.status).toBe(403);

    // 6. admin resolves: apply incoming for SKU-001
    const resolved = await request(http)
      .post(`/conflicts/${bySku.get('SKU-001')!.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'APPLY_INCOMING', note: 'trust the CSV count' });
    expect(resolved.status).toBe(201);
    expect(resolved.body.status).toBe('RESOLVED_APPLIED');

    const stock = await ctx.prisma.stockItem.findUnique({
      where: { productId: p1.id },
    });
    expect(stock!.quantityOnHand).toBe(130);

    // 7. resolving the same conflict again is a 409
    const again = await request(http)
      .post(`/conflicts/${bySku.get('SKU-001')!.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'KEEP_CURRENT' });
    expect(again.status).toBe(409);

    // 8. everything is in the audit trail
    const audit = await request(http)
      .get('/audit?entityType=INVENTORY')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(audit.status).toBe(200);
    const actions = audit.body.map((a: any) => a.action);
    expect(actions).toContain('FIELD_APPLIED');
    expect(actions).toContain('CONFLICT_OPENED');
    expect(actions).toContain('CONFLICT_RESOLVED');
    expect(actions).toContain('PRODUCT_CREATED');

    // 9. batch list shows the completed import
    const list = await request(http)
      .get('/imports')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].status).toBe('COMPLETED');
  });

  it('sales users never see cost fields in product/stock listings', async () => {
    const res = await request(http)
      .get('/products')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    for (const row of res.body.data) {
      expect(row).not.toHaveProperty('unitCost');
      expect(row).not.toHaveProperty('defaultPrice');
    }

    const stockRes = await request(http)
      .get('/stock')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(stockRes.status).toBe(200);
    for (const row of stockRes.body.data) {
      expect(row).not.toHaveProperty('reorderPoint');
    }

    const adminRes = await request(http)
      .get('/products')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.body.data[0]).toHaveProperty('unitCost');
  });
});
