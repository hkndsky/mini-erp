import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedUser, login, TestContext } from './helpers';

describe('source pipelines: partner API, CSV edge cases, legacy table (integration)', () => {
  let ctx: TestContext;
  let http: any;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await seedUser(ctx.prisma, { name: 'Erin Admin', email: 'admin@erp.local', role: 'ADMIN' });
    const admin = await login(ctx.app, 'admin@erp.local');
    adminToken = admin.accessToken;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('partner import: unreachable API -> 502 to caller and FAILED batch in DB', async () => {
    // PARTNER_API_URL is set by test/global-setup.ts to a free port with
    // nothing listening, so this test never depends on the local environment.
    const res = await request(http)
      .post('/imports/partner')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(502);

    const batch = await ctx.prisma.importBatch.findFirst({ orderBy: { startedAt: 'desc' } });
    expect(batch!.status).toBe('FAILED');
    expect(batch!.errorMessage).toContain('Partner API unreachable');
  });

  it('CSV upload without a file is a 400', async () => {
    const res = await request(http)
      .post('/imports/csv')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('CSV without a SKU column is a 400 with a helpful message', async () => {
    const csv = 'name,qty\nFoo,3\n';
    const res = await request(http)
      .post('/imports/csv')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(csv), 'bad.csv');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('SKU');

    const batches = await ctx.prisma.importBatch.count();
    expect(batches).toBe(1); // structural failure still records a failed batch
  });

  it('CSV with invalid rows completes with per-row errors, not a 500', async () => {
    const csv = [
      'sku,name,quantity_on_hand,unit_cost',
      'SKU-A,Good thing,10,1.00',
      'SKU-B,Bad qty,abc,2.00',
      ',no sku row,,',
    ].join('\n');
    const res = await request(http)
      .post('/imports/csv')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(csv), 'mixed.csv');
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.totalRecords).toBe(2); // SKU-A + SKU-B (bad qty kept, field ignored)
    expect(res.body.errors).toHaveLength(2); // invalid qty row 3 + missing sku row 4
    expect(res.body.errors[0]).toMatchObject({ row: 3, sku: 'SKU-B' });

    const product = await ctx.prisma.product.findUnique({
      where: { sku: 'SKU-B' },
      include: { stock: true },
    });
    expect(product).not.toBeNull();
    expect(product!.stock!.quantityOnHand).toBe(0); // field ignored -> default
  });

  it('legacy import: messy table normalized, orphans/dupes/unparseables reported', async () => {
    await ctx.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS legacy_inventory (
        item_id INTEGER, sku TEXT, descr TEXT, stock_qty TEXT, cost TEXT, whse TEXT, last_upd TEXT
      )
    `);
    await ctx.prisma.$executeRawUnsafe(`DELETE FROM legacy_inventory`);
    await ctx.prisma.$executeRawUnsafe(`
      INSERT INTO legacy_inventory (item_id, sku, descr, stock_qty, cost, whse) VALUES
        (1, ' sku-101 ', 'Legacy widget', ' 50 ', '$1.50', 'WH-A'),
        (2, NULL, 'Orphan', '5', '1.0', NULL),
        (3, 'SKU-101', 'DUPLICATE', '999', '9.99', 'WH-B'),
        (4, 'SKU-102', 'Broken qty', 'xyz', '2.00', NULL)
    `);

    const res = await request(http)
      .post('/imports/legacy')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.totalRecords).toBe(2); // SKU-101 (first wins) + SKU-102
    expect(res.body.errors).toHaveLength(3); // orphan + duplicate + unparseable qty

    const p = await ctx.prisma.product.findUnique({
      where: { sku: 'SKU-101' },
      include: { stock: true },
    });
    expect(p).not.toBeNull();
    expect(p!.stock!.quantityOnHand).toBe(50);
    expect(Number(p!.unitCost)).toBeCloseTo(1.5);
  });

  it('sales cannot trigger any import (403)', async () => {
    await seedUser(ctx.prisma, { name: 'Sara Sales', email: 'sales@erp.local', role: 'SALES' });
    const sales = await login(ctx.app, 'sales@erp.local');
    const res = await request(http)
      .post('/imports/partner')
      .set('Authorization', `Bearer ${sales.accessToken}`);
    expect(res.status).toBe(403);
  });
});
