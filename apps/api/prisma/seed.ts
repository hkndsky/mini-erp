/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const password = bcrypt.hashSync('Password123!', 10);

const LEGACY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS legacy_inventory (
  item_id   INTEGER,
  sku       TEXT,
  descr     TEXT,
  stock_qty TEXT,
  cost      TEXT,
  whse      TEXT,
  last_upd  TEXT
);
`;

const LEGACY_SEED_SQL = `
INSERT INTO legacy_inventory (item_id, sku, descr, stock_qty, cost, whse, last_upd) VALUES
  (1, 'SKU-001', 'Bolt M8 x 40',          '120',   '$2.40',  'WH-A', '2025-11-02'),
  (2, ' sku-002 ', 'NUT M8 (zinc)',       ' 85 ',  '1.10',   'WH-A', '2025-11-02'),
  (3, 'SKU-003', 'Washer 8mm',            '1,200', '$0.05',  'WH-B', '2025-11-03'),
  (4, 'SKU-001', 'BOLT M8 X 40 (REV A)',  '98',    '2.40',   'WH-A', '2025-11-01'),
  (5, NULL,      'Orphan row - no SKU',   '50',    '9.99',   NULL,   NULL),
  (6, 'SKU-004', 'Hex Flange M10',        '44',    '$3.75',  'WH-B', '2025-11-04'),
  (7, 'SKU-002', 'Nut M8',                'abc',   '0.9',    'WH-A', NULL);
`;

async function main() {
  console.log('seeding users...');
  for (const u of [
    { name: 'Erin Admin', email: 'admin@erp.local', role: 'ADMIN' },
    { name: 'Wes Warehouse', email: 'warehouse@erp.local', role: 'WAREHOUSE' },
    { name: 'Sara Sales', email: 'sales@erp.local', role: 'SALES' },
  ] as const) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        role: u.role,
        passwordHash: password,
      },
    });
  }

  console.log('seeding suppliers...');
  const acme = await prisma.supplier.upsert({
    where: { code: 'ACME' },
    update: {},
    create: {
      code: 'ACME',
      name: 'Acme Fasteners',
      contactEmail: 'orders@acme-fasteners.example',
      phone: '+1-555-0101',
    },
  });
  const boltWorks = await prisma.supplier.upsert({
    where: { code: 'BOLTWORKS' },
    update: {},
    create: {
      code: 'BOLTWORKS',
      name: 'Bolt Works GmbH',
      contactEmail: 'vertrieb@boltworks.example',
      phone: '+49-555-0102',
    },
  });

  console.log('seeding products + stock...');
  const products = [
    { sku: 'SKU-001', name: 'Bolt M8 x 40', category: 'BOLTS', unitCost: 2.4, defaultPrice: 4.9, supplier: acme, qty: 120, reorder: 50, location: 'WH-A' },
    { sku: 'SKU-002', name: 'Nut M8 Zinc', category: 'NUTS', unitCost: 1.1, defaultPrice: 2.5, supplier: acme, qty: 85, reorder: 40, location: 'WH-A' },
    { sku: 'SKU-003', name: 'Washer 8mm', category: 'WASHERS', unitCost: 0.05, defaultPrice: 0.3, supplier: boltWorks, qty: 1200, reorder: 500, location: 'WH-B' },
    { sku: 'SKU-004', name: 'Hex Flange M10', category: 'BOLTS', unitCost: 3.75, defaultPrice: 7.9, supplier: boltWorks, qty: 44, reorder: 25, location: 'WH-B' },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        category: p.category,
        unitCost: p.unitCost,
        defaultPrice: p.defaultPrice,
        supplierId: p.supplier.id,
        stock: {
          create: {
            quantityOnHand: p.qty,
            reorderPoint: p.reorder,
            location: p.location,
          },
        },
      },
    });
  }

  console.log('seeding orders...');
  const sku001 = await prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-001' } });
  const sku003 = await prisma.product.findUniqueOrThrow({ where: { sku: 'SKU-003' } });
  const o1exists = await prisma.order.findUnique({ where: { number: 'ORD-1001' } });
  if (!o1exists) {
    await prisma.order.create({
      data: {
        number: 'ORD-1001',
        customerName: 'Northwind Traders',
        status: 'CONFIRMED',
        items: {
          create: [
            { productId: sku001.id, sku: 'SKU-001', quantity: 10, unitPrice: 4.9 },
          ],
        },
      },
    });
  }
  const o2exists = await prisma.order.findUnique({ where: { number: 'ORD-1002' } });
  if (!o2exists) {
    await prisma.order.create({
      data: {
        number: 'ORD-1002',
        customerName: 'Contoso Ltd',
        status: 'DRAFT',
        items: {
          create: [
            { productId: sku003.id, sku: 'SKU-003', quantity: 500, unitPrice: 0.3 },
          ],
        },
      },
    });
  }

  console.log('seeding legacy table (deliberately messy)...');
  await prisma.$executeRawUnsafe(LEGACY_TABLE_SQL);
  await prisma.$executeRawUnsafe(`DELETE FROM legacy_inventory`);
  await prisma.$executeRawUnsafe(LEGACY_SEED_SQL);

  console.log('seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
