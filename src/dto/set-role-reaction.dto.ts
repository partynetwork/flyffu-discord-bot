// TODO: Add class-validator decorators once module resolution is fixed
// import { IsString } from 'class-validator';

export class SetRoleReactionDto {
  // @IsString()
  emoji: string;

  // @IsString()
  roleId: string;
}
