import {
  Body,
  Param,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Res,
  UseFilters,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';

import { UserTokenGuard } from '../core/user-token-guard';
import { ReaderAnalyticsService } from './reader-analytics.service';
import { Response } from 'express';
import { CurrentSession, Session } from '../core/session.decorator';
import { FhirFilter } from '../core/fhir-filter';

@Controller('/readers-analytics')
@UseFilters(new FhirFilter())
export class ReaderAnalyticsController {
  constructor(private readonly analyticsService: ReaderAnalyticsService) {}

  /**
   * Download csv report of readers analytics
   */
  @Post('/download-csv')
  @UseGuards(UserTokenGuard)
  public async downloadCsv(
    @Res() res: Response,
    @Session() { practitioner }: CurrentSession,
    @Body() payload: { startDate: string; endDate: string; groupId: string }
  ) {
    if (!practitioner) {
      throw new ForbiddenException('Need to login as practitioner');
    }
    if (!payload.groupId) {
      throw new BadRequestException('Missing group id');
    }
    if (!payload.startDate || !payload.endDate) {
      throw new BadRequestException('Missing startDate or endDate');
    }
    const data = await this.analyticsService.fetchReadersReport(payload);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="diagnosis-analytics.csv"'
    );

    res.send(data);

    return;
  }

  /**
   * Get media info like url/type from the media id
   * @param mediaId
   * @returns
   */
  @Get('/media/:mediaId/url')
  @UseGuards(UserTokenGuard)
  public async getMediaById(
    @Session() { practitioner }: CurrentSession,
    @Param('mediaId') mediaId: string
  ) {
    if (!practitioner) {
      throw new ForbiddenException('Need to login as practitioner');
    }
    const media = await this.analyticsService.getMediaById(mediaId);
    if (!media) {
      throw new BadRequestException('Media not found');
    }
    return media.content;
  }
}
