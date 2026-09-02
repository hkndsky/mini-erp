import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { endpoints } from '../api';
import type { PublicUser } from '../api/types';

export function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'u-1',
    name: 'Test User',
    email: 'test@erp.local',
    role: 'ADMIN',
    ...overrides,
  };
}

/**
 * Renders UI inside <AuthProvider>. AuthProvider restores the session via
 * endpoints.auth.me() on mount, so the test's mocked module must provide it —
 * we pin it to `user` here for every render.
 */
export function renderAs(user: PublicUser, ui: ReactElement): RenderResult {
  vi.mocked(endpoints.auth.me).mockResolvedValue(user);
  return render(<AuthProvider>{ui}</AuthProvider>);
}
