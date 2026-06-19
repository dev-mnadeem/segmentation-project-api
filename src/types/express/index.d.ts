import type { UserRole } from '../../domain/models';

declare global {
  namespace Express {
    /** Claims lifted off a verified bearer token by `attachUser`. */
    interface AuthenticatedUser {
      id: string;
      email: string;
      role: UserRole;
      name?: string;
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
