import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seedUser, login, PASSWORD, TestContext } from './helpers';

describe('auth (integration)', () => {
  let ctx: TestContext;
  let http: any;

  beforeAll(async () => {
    ctx = await createTestApp();
    http = ctx.app.getHttpServer();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await seedUser(ctx.prisma, { name: 'Erin Admin', email: 'admin@erp.local', role: 'ADMIN' });
    await seedUser(ctx.prisma, { name: 'Sara Sales', email: 'sales@erp.local', role: 'SALES' });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('login with valid credentials returns a token and a public user', async () => {
    const res = await request(http).post('/auth/login').send({
      email: 'admin@erp.local',
      password: PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'admin@erp.local', role: 'ADMIN' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('login with a wrong password returns 401 (no user enumeration)', async () => {
    const res = await request(http)
      .post('/auth/login')
      .send({ email: 'admin@erp.local', password: 'nope-nope' });
    expect(res.status).toBe(401);
  });

  it('login with an unknown email returns 401 with the same message', async () => {
    const a = await request(http)
      .post('/auth/login')
      .send({ email: 'ghost@erp.local', password: 'whatever' });
    const b = await request(http)
      .post('/auth/login')
      .send({ email: 'admin@erp.local', password: 'whatever' });
    expect(a.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('requests without a token are rejected with 401', async () => {
    const res = await request(http).get('/products');
    expect(res.status).toBe(401);
  });

  it('self-registration is limited to WAREHOUSE and SALES (ADMIN rejected)', async () => {
    const res = await request(http)
      .post('/auth/register')
      .send({
        name: 'Not Admin',
        email: 'admin2@erp.local',
        password: 'longenough',
        role: 'ADMIN',
      });
    expect(res.status).toBe(400);
  });

  it('registered SALES user can log in and /auth/me reflects them', async () => {
    const reg = await request(http)
      .post('/auth/register')
      .send({
        name: 'New Sales',
        email: 'new.sales@erp.local',
        password: 'longenough',
        role: 'SALES',
      });
    expect(reg.status).toBe(201);
    expect(reg.body.role).toBe('SALES');

    const { accessToken } = await login(ctx.app, 'new.sales@erp.local', 'longenough');
    const me = await request(http).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('new.sales@erp.local');
  });

  it('SALES is forbidden from admin routes (403, not 401)', async () => {
    const { accessToken } = await login(ctx.app, 'sales@erp.local');
    const res = await request(http)
      .get('/audit')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });
});
