// TODO: Add class-validator decorators once module resolution is fixed
// import { IsString, IsArray, ArrayMinSize } from 'class-validator';

export class CreateVotingDto {
  // @IsString()
  channelId: string;

  // @IsString()
  title: string;

  // @IsArray()
  // @ArrayMinSize(2)
  // @IsString({ each: true })
  options: string[];
}
