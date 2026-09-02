import express from 'express';

/**
 * Mock partner service.
 *
 * Simulates an external supplier feed with two JSON endpoints:
 *   GET /inventory  - their stock levels (may disagree with ours on purpose)
 *   GET /orders    - their open orders
 *
 * Tunable via env:
 *   PORT              (default 4010)
 *   PARTNER_DELAY_MS  artificial latency (default 0)
 *   PARTNER_FAIL_RATE probability [0..1] that a request fails with 503,
 *                       used to exercise the API's retry/timeout path
 */

const PORT = Number(process.env.PORT ?? 4010);
const DELAY_MS = Number(process.env.PARTNER_DELAY_MS ?? 0);
const FAIL_RATE = Math.min(Math.max(Number(process.env.PARTNER_FAIL_RATE ?? 0), 0), 1);

const INVENTORY = [
  { sku: 'SKU-001', name: 'Bolt M8 x 40 (ACME)', quantityOnHand: 120, unitCost: 2.45, location: 'ACME-WH1' },
  { sku: 'SKU-002', name: 'Nut M8 Zinc (ACME)', quantityOnHand: 85, unitCost: 1.13, location: 'ACME-WH1' },
  { sku: 'SKU-003', name: 'Washer 8mm', quantityOnHand: 1200, unitCost: 0.05, location: 'ACME-WH2' },
  { sku: 'SKU-006', name: 'Coupling Nut M12 (new)', quantityOnHand: 300, unitCost: 0.85, location: 'ACME-WH2' },
];

const ORDERS = [
  {
    orderNumber: 'PNR-1001',
    customerName: 'Partner Warehouse A',
    status: 'CONFIRMED',
    items: [
      { sku: 'SKU-001', quantity: 25, unitPrice: 2.6 },
      { sku: 'SKU-002', quantity: 40, unitPrice: 1.2 },
    ],
  },
  {
    orderNumber: 'PNR-1002',
    customerName: 'Partner Warehouse B',
    status: 'DRAFT',
    items: [{ sku: 'SKU-003', quantity: 100, unitPrice: 0.06 }],
  },
];

const app = express();

app.use((req, res, next) => {
  if (DELAY_MS > 0) return setTimeout(next, DELAY_MS);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'mock-partner', time: new Date().toISOString() });
});

app.get('/inventory', (_req, res) => {
  if (Math.random() < FAIL_RATE) return res.status(503).json({ error: 'partner temporarily unavailable' });
  res.json(INVENTORY);
});

app.get('/orders', (_req, res) => {
  if (Math.random() < FAIL_RATE) return res.status(503).json({ error: 'partner temporarily unavailable' });
  res.json(ORDERS);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`mock-partner listening on :${PORT} (delay=${DELAY_MS}ms, failRate=${FAIL_RATE})`);
});
