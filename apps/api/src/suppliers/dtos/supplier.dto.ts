import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
