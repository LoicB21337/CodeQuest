import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(3, 20)
  @Matches(/^[\p{L}\p{N}_.-]+$/u)
  username!: string;

  @IsString()
  @Length(12, 1024)
  password!: string;
}

export class LoginDto {
  @IsString()
  @Length(1, 254)
  identifier!: string;

  @IsString()
  @Length(1, 1024)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @Length(32, 128)
  token!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(32, 128)
  token!: string;

  @IsString()
  @Length(12, 1024)
  newPassword!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsBoolean()
  everywhere?: boolean;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Length(3, 20)
  @Matches(/^[\p{L}\p{N}_.-]+$/u)
  username?: string;
}

export class DeleteMeDto {
  @IsString()
  @Length(1, 1024)
  password!: string;
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
