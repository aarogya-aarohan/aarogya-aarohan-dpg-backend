import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CreateReaderGroupDto } from './dto/reader-group.dto';
import { ReaderGroupService } from './reader-group.service';
import { UserTokenGuard } from '../core/user-token-guard';
import type { Parameters, Practitioner, Reference } from '@medplum/fhirtypes';
import { ReaderTaskService } from './reader-task-service';
import { CurrentSession, Session } from '../core/session.decorator';
import { FhirFilter } from '../core/fhir-filter';
import { ReaderStatsResponse } from './dto/reader-task.dto';
import { AiInferenceService } from './ai-inference.service';
import { SubmitInference } from './dto/inference.dto';

@Controller('/readers')
@UseFilters(new FhirFilter())
export class ReaderController {
  constructor(
    private readonly groups: ReaderGroupService,
    private readonly tasks: ReaderTaskService,
    private readonly inference: AiInferenceService
  ) {}

  /**
   * Find all the reader group
   */
  @Get('/groups')
  @UseGuards(UserTokenGuard)
  async list(@Session() { practitioner }: CurrentSession) {
    if (!practitioner) {
      throw new ForbiddenException('Need to login');
    }
    return this.groups.findGroups();
  }

  /**
   * Create a new reader group
   * @param payload
   * @param practitioner
   */
  @UseGuards(UserTokenGuard)
  @Post('/groups')
  async create(
    @Body() payload: CreateReaderGroupDto,
    @Session() { practitioner }: CurrentSession
  ) {
    if (!practitioner) {
      throw new ForbiddenException('Need to login');
    }
    return this.groups.create(payload);
  }

  /**
   * Find all reader task for the practitioner
   */
  @Get('/tasks')
  @UseGuards(UserTokenGuard)
  public async getNextTask(@Session() { practitioner }: CurrentSession) {
    if (!practitioner) {
      throw new ForbiddenException('Need to login as practitioner');
    }
    const ref = {
      reference: [practitioner.resourceType, practitioner.id].join('/'),
    } as Reference<Practitioner>;
    return this.tasks.findNextTask(ref);
  }

  /**
   * Find all reader task for the practitioner
   */
  @Get('/stats')
  @UseGuards(UserTokenGuard)
  public async getReaderStats(@Session() { practitioner }: CurrentSession) {
    if (!practitioner) {
      throw new ForbiddenException('Need to login as practitioner');
    }
    const ref = {
      reference: [practitioner.resourceType, practitioner.id].join('/'),
    } as Reference<Practitioner>;
    const data = await this.tasks.findReaderStats(ref);
    const response = new ReaderStatsResponse();
    response.status = 'ok';
    response.data = data;
    return response;
  }

  @UseGuards(UserTokenGuard)
  @Post('/tasks/submit')
  public submit(@Body() payload: Parameters, @Session() s: CurrentSession) {
    if (!s.practitioner) {
      throw new ForbiddenException(
        'You will need to be logged in as a Practitioner'
      );
    }
    return this.tasks.submit(payload, s.practitioner);
  }

  @UseGuards(UserTokenGuard)
  @Get('/inference/images')
  public getMediaForInference(@Session() s: CurrentSession) {
    if (!s.practitioner) {
      throw new ForbiddenException(
        'You will need to be logged in as a Practitioner'
      );
    }
    return this.inference.getPendingImageForInference();
  }

  @UseGuards(UserTokenGuard)
  @Post('/inference')
  public submitInference(
    @Session() s: CurrentSession,
    @Body() payload: SubmitInference
  ) {
    if (!s.practitioner) {
      throw new ForbiddenException(
        'You will need to be logged in as a Practitioner'
      );
    }
    return this.inference.submitInferenceResult(payload.inferences);
  }
}
