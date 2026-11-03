import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reference } from '@medplum/fhirtypes';
import { Duration } from 'luxon';

@Injectable()
export class ReaderConfig {
  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return this.config.get<boolean>('READER_ENABLED');
  }

  get mediaPerCronRun() {
    return +this.config.get<number>('READER_PER_CRON_MEDIA');
  }

  get cronLockMinutes() {
    return +this.config.get<number>('READER_CRON_LOCK_MINUTES', 30);
  }

  get instantiateCanonical() {
    const defValue =
      'https://midas.iisc.ac.in/fhir/ActivityDefinition/oral-cancer-label-image';
    const KEY = 'READER_TASK_INSTANTIATE_CANONICAL';
    return this.config.get<string>(KEY, defValue);
  }

  get readerTaskUri() {
    const defValue =
      'https://midas.iisc.ac.in/fhir/Task/oral-cancer-label-image';
    const KEY = 'READER_TASK_URI';
    return this.config.get<string>(KEY, defValue);
  }

  get questionnaire() {
    const defValue = 'Questionnaire/OralCancerImageLabel';
    const KEY = 'READER_QUESTIONNAIRE_REFERENCE';
    return {
      reference: this.config.get<string>(KEY, defValue),
    } as Reference;
  }

  get encounterReaderSystem() {
    return 'http://midas.iisc.ac.in/reader-task-generation';
  }

  get encounterReaderCodeSuccess() {
    return 'finished';
  }

  get taskStageTagReaderSystem() {
    return 'http://midas.iisc.ac.in/reader-task-stage';
  }

  get taskTagReaderCodeStage1() {
    return '1';
  }

  get taskTagReaderCodeStage2() {
    return '2';
  }

  isTaskStage1(stage: unknown) {
    return stage === this.taskTagReaderCodeStage1;
  }

  isTaskStage2(stage: unknown) {
    return stage === this.taskTagReaderCodeStage2;
  }

  get durationBetweenTaskStage() {
    const day = this.config.get<number>('READER_TASK_INTERVAL_DAYS');
    return Duration.fromDurationLike({ day });
  }

  get inferenceClassExtensionUrl() {
    return 'http://midas.iisc.ac.in/reader-ai-inference-class';
  }

  get inferenceConfidenceExtensionUrl() {
    return 'http://midas.iisc.ac.in/reader-ai-inference-confidence';
  }

  get aiInferenceTagSystem() {
    return 'http://midas.iisc.ac.in/reader-ai-inference-status';
  }

  get aiInferenceTagFinished() {
    return 'finished';
  }

  get imageLabellingQuestionnaireUrl() {
    return 'https://midas.iisc.ac.in/fhir/Questionnaire/OralCancerLabelImage';
  }

  get patientRegistrationDateExtensionUrl() {
    return 'https://midas.iisc.ac.in/fhir/StructureDefinition/patient-registraion-date';
  }

  get patientSiteIdTagSystem() {
    return 'http://midas.iisc.ac.in/site-id';
  }
}
