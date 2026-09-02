export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'WAREHOUSE' | 'SALES';
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'WAREHOUSE' | 'SALES';
}

export function toPublicUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
}): PublicUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role as PublicUser['role'] };
}
