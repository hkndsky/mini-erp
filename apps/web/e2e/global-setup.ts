import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// The import -> conflict -> order e2e asserts exact counts, so it needs a
// freshly seeded database. We reset + re-seed the database the API uses before
// the suite runs so that `npm run test:e2e` is self-contained and repeatable
// (CI already starts from a fresh seeded DB via `docker compose up`).
const API_DIR = resolve(__dirname, '../../api');
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://erp:erp_pass@127.0.0.1:5432/erp';

export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL };
  const run = (cmd: string) =>
    execSync(cmd, { cwd: API_DIR, env, stdio: 'inherit', timeout: 120_000 });

  // Drop all data, re-create the schema, then re-seed (the seed is idempotent).
  run('npx prisma db push --force-reset --skip-generate --schema prisma/schema.prisma');
  run('npx prisma db seed');
}
