import { IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { OmitType } from '@nestjs/swagger';

export class ReaderGroup {
  @IsString()
  id: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(2)
  members: string[];
}

export class CreateReaderGroupDto extends OmitType(ReaderGroup, ['id']) {}
