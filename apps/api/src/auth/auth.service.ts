import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Collection } from 'mongodb';
import { MongoService } from '../mongo/mongo.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { AuthUser } from './types/auth-user.type';

type JwtPayload = AuthUser & {
  sub: string;
  iat: number;
  exp: number;
  tv: number;
};

type UserDocument = {
  _id: string;
  email?: string;
  phone?: string;
  name?: string;
  passwordHash?: string;
  passwordSalt?: string;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 10;

const authRateLimitBuckets = new Map<string, RateLimitBucket>();

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly mongoService: MongoService,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const phone = this.normalizePhone(dto.phone);
    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required');
    }

    this.enforceRateLimit(`register:${email ?? phone}`);
    const db = await this.mongoService.db();
    const users = db.collection<UserDocument>('users');
    const now = new Date();
    const existingUser = await this.findUserByIdentity(users, email, phone);
    if (existingUser) {
      if (existingUser.passwordHash && existingUser.passwordSalt) {
        throw new ConflictException('Account already exists');
      }

      const passwordSalt = randomBytes(16).toString('base64url');
      const passwordHash = this.hashPassword(dto.password, passwordSalt);
      await users.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            email: email ?? existingUser.email,
            phone: phone ?? existingUser.phone,
            name: dto.name?.trim() || existingUser.name,
            passwordHash,
            passwordSalt,
            lastLoginAt: now,
            updatedAt: now,
          },
        },
      );

      const user = this.toAuthUser({
        ...existingUser,
        email: email ?? existingUser.email,
        phone: phone ?? existingUser.phone,
        name: dto.name?.trim() || existingUser.name,
        passwordHash,
        passwordSalt,
      });
      return {
        accessToken: this.signUser(user, existingUser.tokenVersion ?? 0),
        user,
      };
    }

    const userId = randomUUID();
    const passwordSalt = randomBytes(16).toString('base64url');
    const passwordHash = this.hashPassword(dto.password, passwordSalt);

    await users.insertOne({
      _id: userId,
      email,
      phone,
      name: dto.name?.trim() || undefined,
      passwordHash,
      passwordSalt,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    });

    const user = this.toAuthUser({
      _id: userId,
      email,
      phone,
      name: dto.name?.trim() || undefined,
      passwordHash,
      passwordSalt,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    });

    return {
      accessToken: this.signUser(user, 0),
      user,
    };
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);
    const phone = this.normalizePhone(dto.phone);
    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required');
    }

    this.enforceRateLimit(`login:${email ?? phone}`);
    const db = await this.mongoService.db();
    const users = db.collection<UserDocument>('users');
    const existingUser = await this.findUserByIdentity(users, email, phone);
    if (!existingUser) {
      throw new UnauthorizedException('Account does not exist. Create account first.');
    }

    if (!existingUser.passwordHash || !existingUser.passwordSalt) {
      throw new UnauthorizedException('Create a password for this account first');
    }

    const passwordHash = this.hashPassword(dto.password, existingUser.passwordSalt);
    if (!this.safeEqual(passwordHash, existingUser.passwordHash)) {
      throw new UnauthorizedException('Incorrect password');
    }

    await users.updateOne(
      { _id: existingUser._id },
      {
        $set: {
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    const user = this.toAuthUser(existingUser);
    return {
      accessToken: this.signUser(user, existingUser.tokenVersion ?? 0),
      user,
    };
  }

  async checkAccount(query: { email?: string; phone?: string }, ip?: string) {
    const email = this.normalizeEmail(query.email);
    const phone = this.normalizePhone(query.phone);
    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required');
    }

    if (ip) this.enforceRateLimit(`check-ip:${ip}`);
    this.enforceRateLimit(`check:${email ?? phone}`);
    const db = await this.mongoService.db();
    const users = db.collection<UserDocument>('users');
    const existingUser = await this.findUserByIdentity(users, email, phone);

    return { exists: Boolean(existingUser) };
  }

  async logout(userId: string) {
    const db = await this.mongoService.db();
    const users = db.collection<UserDocument>('users');
    await users.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
    return { success: true };
  }

  async verifyBearerToken(authorizationHeader?: string): Promise<AuthUser> {
    const token = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    return this.verifyToken(token);
  }

  private signUser(user: AuthUser, tokenVersion: number): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = Number(
      this.configService.get<string>('JWT_TTL_SECONDS', `${60 * 60 * 24 * 30}`),
    );
    const payload: JwtPayload = {
      ...user,
      sub: user.userId,
      iat: nowSeconds,
      exp: nowSeconds + ttlSeconds,
      tv: tokenVersion,
    };
    const encodedHeader = this.base64UrlEncode(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    );
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private async verifyToken(token: string): Promise<AuthUser> {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid token');
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
    if (!this.safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid token signature');
    }

    let payload: Partial<JwtPayload>;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as Partial<JwtPayload>;
    } catch {
      throw new UnauthorizedException('Invalid token payload');
    }
    if (!payload.userId || (!payload.email && !payload.phone) || !payload.exp) {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    const db = await this.mongoService.db();
    const users = db.collection<UserDocument>('users');
    const user = await users.findOne({ _id: payload.userId });
    if (!user || (user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return {
      userId: payload.userId,
      email: payload.email,
      phone: payload.phone,
      name: payload.name,
    };
  }

  private async findUserByIdentity(
    users: Collection<UserDocument>,
    email?: string,
    phone?: string,
  ): Promise<UserDocument | null> {
    const conditions: Array<Record<string, string>> = [];
    if (email) conditions.push({ email });
    if (phone) conditions.push({ phone });
    if (conditions.length === 0) return null;
    return users.findOne({ $or: conditions });
  }

  private toAuthUser(user: UserDocument): AuthUser {
    return {
      userId: user._id,
      email: user.email,
      phone: user.phone,
      name: user.name,
    };
  }

  private normalizeEmail(email?: string): string | undefined {
    const normalized = email?.trim().toLowerCase();
    return normalized || undefined;
  }

  private normalizePhone(phone?: string): string | undefined {
    const normalized = phone?.trim().replace(/[\s().-]/g, '');
    return normalized || undefined;
  }

  private hashPassword(password: string, salt: string): string {
    return pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('base64url');
  }

  private enforceRateLimit(key: string): void {
    const now = Date.now();
    const bucket = authRateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      authRateLimitBuckets.set(key, {
        count: 1,
        resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS,
      });
      return;
    }

    if (bucket.count >= AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
      throw new HttpException('Too many auth attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count += 1;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.getJwtSecret())
      .update(value)
      .digest('base64url');
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private getJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is missing');
    }
    return secret;
  }
}
