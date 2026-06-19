import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_TTL, PASSWORD_HASH_ROUNDS } from '../config/constants';
import type { User } from '../domain/models';
import type { UserRepository } from '../domain/ports';
import { ApiError, isDuplicateKeyError } from '../lib/errors';
import type { LoginBody, SignupBody } from '../validation/schemas';

export interface AuthResult {
  user: User;
  token: string;
  expiresIn: string;
}

export interface AuthServiceOptions {
  users: UserRepository;
  /** `undefined` means auth is configured off; the endpoints then 503. */
  jwtSecret?: string;
}

export class AuthService {
  constructor(private readonly options: AuthServiceOptions) {}

  async signup(input: SignupBody): Promise<AuthResult> {
    const secret = this.requireSecret();

    const existing = await this.options.users.findByEmail(input.email);
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);

    let user: User;
    try {
      user = await this.options.users.create({
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      });
    } catch (error) {
      // Two concurrent signups for the same address both pass the check above;
      // the unique index is what actually settles it.
      if (isDuplicateKeyError(error)) {
        throw ApiError.conflict('An account with this email already exists');
      }
      throw error;
    }

    return { user, token: this.issueToken(user, secret), expiresIn: ACCESS_TOKEN_TTL };
  }

  async login(input: LoginBody): Promise<AuthResult> {
    const secret = this.requireSecret();

    const record = await this.options.users.findByEmail(input.email);
    // Same message and (roughly) the same work either way, so the response does
    // not reveal whether the address is registered.
    const hash =
      record?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordMatches = await bcrypt.compare(input.password, hash);
    if (!record || !passwordMatches) throw ApiError.unauthorized('Invalid credentials');

    const { passwordHash: _passwordHash, ...user } = record;
    return { user, token: this.issueToken(user, secret), expiresIn: ACCESS_TOKEN_TTL };
  }

  private requireSecret(): string {
    if (!this.options.jwtSecret) {
      throw ApiError.serviceUnavailable('Authentication is not configured: JWT_SECRET is unset');
    }
    return this.options.jwtSecret;
  }

  private issueToken(user: User, secret: string): string {
    return jwt.sign({ email: user.email, role: user.role, name: user.name }, secret, {
      subject: user.id,
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }
}
