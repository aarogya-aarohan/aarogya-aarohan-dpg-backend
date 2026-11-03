import {
  IsArray,
  IsNotEmpty,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';

export class Inference {
  @IsString()
  @IsNotEmpty()
  mediaId: string;

  @IsString()
  @IsNotEmpty()
  class: string;

  @IsPositive()
  confidence: number;
}

export class SubmitInference {
  @IsArray()
  @MinLength(1)
  inferences: Inference[];
}
