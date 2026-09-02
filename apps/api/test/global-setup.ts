import { execSync } from 'node:child_process';
import * as net from 'node:net';
import { Client } from 'pg';

const TEST_DB_URL = 'postgresql://erp:erp_pass@127.0.0.1:5432/erp_test';

export default async function setup() {
  const target = new URL(TEST_DB_URL);
  const admin = new Client({
    host: target.hostname,
    port: Number(target.port || 5432),
    user: target.username,
    password: target.password,
    database: 'postgres',
  });
  await admin.connect();
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [target.pathname.slice(1)]);
  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${target.pathname.slice(1)}"`);
  }
  await admin.end();

  // Reset the test database before the suite runs.
  execSync('npx prisma db push --force-reset --skip-generate --schema prisma/schema.prisma', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'inherit',
    cwd: process.cwd(),
    timeout: 120000,
  });

  // The "partner unreachable" integration test needs a partner URL that is
  // guaranteed to refuse connections, so it cannot depend on whatever happens
  // to be listening on this machine (e.g. the mock partner from `npm run dev`).
  // Grab a free loopback port and close it; nothing else gets it in practice.
  const deadPort = await new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = (probe.address() as net.AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });
  process.env.PARTNER_API_URL = `http://127.0.0.1:${deadPort}`;
}
