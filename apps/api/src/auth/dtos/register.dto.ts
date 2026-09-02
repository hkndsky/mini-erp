import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

export const REGISTERABLE_ROLES = ['WAREHOUSE', 'SALES'] as const;

export class RegisterDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /**
   * Self-registration is intentionally limited: ADMIN accounts are only ever
   * created out-of-band (seed / DBA), never through the API.
   */
  @IsIn(REGISTERABLE_ROLES)
  role!: (typeof REGISTERABLE_ROLES)[number];
}
