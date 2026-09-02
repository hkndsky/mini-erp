import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { PublicUser, toPublicUser } from './types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get secret() {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    // Same error for unknown email and bad password (no user enumeration).
    if (!user || !bcrypt.compareSync(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      this.secret,
      { expiresIn: '12h' },
    );
    return { accessToken, user: toPublicUser(user) };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Email already registered');
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        role: dto.role,
        passwordHash: bcrypt.hashSync(dto.password, 10),
      },
    });
    return toPublicUser(user);
  }

  async me(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException('User no longer exists');
    return toPublicUser(user);
  }
}
