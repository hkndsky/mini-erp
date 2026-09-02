import { describe, it, expect } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/auth/roles.guard';
import { Roles } from '../../src/auth/decorators/roles.decorator';
import {
  canManageInventory,
  canManageOrders,
  canManageSuppliers,
  canResolveConflicts,
  canViewCosts,
} from '../../src/common/rbac';

class TestController {
  @Roles('ADMIN', 'WAREHOUSE')
  restricted() {}

  unrestricted() {}
}

function ctxFor(handler: unknown, user: { role: string } | undefined): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RBAC capability matrix', () => {
  it('SALES is read-mostly: no costs, no writes anywhere', () => {
    expect(canViewCosts('SALES')).toBe(false);
    expect(canManageInventory('SALES')).toBe(false);
    expect(canManageOrders('SALES')).toBe(false);
    expect(canManageSuppliers('SALES')).toBe(false);
    expect(canResolveConflicts('SALES')).toBe(false);
  });

  it('ADMIN and WAREHOUSE share the full operations capability set', () => {
    for (const role of ['ADMIN', 'WAREHOUSE'] as const) {
      expect(canViewCosts(role)).toBe(true);
      expect(canManageInventory(role)).toBe(true);
      expect(canManageOrders(role)).toBe(true);
      expect(canManageSuppliers(role)).toBe(true);
      expect(canResolveConflicts(role)).toBe(true);
    }
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows through when no role is required (even without a user)', () => {
    expect(guard.canActivate(ctxFor(TestController.prototype.unrestricted, undefined))).toBe(true);
  });

  it('allows when the user has one of the required roles', () => {
    const ok = guard.canActivate(
      ctxFor(TestController.prototype.restricted, { role: 'WAREHOUSE' }),
    );
    expect(ok).toBe(true);
  });

  it('forbids when the user role is not in the required set', () => {
    expect(() =>
      guard.canActivate(ctxFor(TestController.prototype.restricted, { role: 'SALES' })),
    ).toThrow(ForbiddenException);
  });

  it('forbids when there is no authenticated user at all', () => {
    expect(() =>
      guard.canActivate(ctxFor(TestController.prototype.restricted, undefined)),
    ).toThrow(ForbiddenException);
  });
});
