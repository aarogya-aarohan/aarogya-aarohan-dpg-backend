import { ConfigService } from '@nestjs/config';
import { Reference } from '@medplum/fhirtypes';
import { Injectable } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';

const DEFAULT_DIAGNOSIS_DAILY_CRON = 'EVERY_DAY_AT_6PM';
const NON_SUSPICIOUS_DAILY_CRON_KEY = 'DIAGNOSIS_NON_SUSPICIOUS_DAILY_CRON_EXPRESSION';
const SPECIALIST_DAILY_CRON_KEY = 'DIAGNOSIS_SPECIALIST_DAILY_CRON_EXPRESSION';
const DIAGNOSIS_DAILY_CRON_MAP = {
  EVERY_DAY_AT_6PM: CronExpression.EVERY_DAY_AT_6PM,
  EVERY_10_MINUTES: CronExpression.EVERY_10_MINUTES,
  EVERY_10_SECONDS: CronExpression.EVERY_10_SECONDS,
  EVERY_30_MINUTES: CronExpression.EVERY_30_MINUTES,
  EVERY_2_HOURS: CronExpression.EVERY_2_HOURS,
  EVERY_5_MINUTES: CronExpression.EVERY_5_MINUTES,
} as const;

function resolveDiagnosisDailyCronExpression(value?: string) {
  const configuredValue = value?.trim() || DEFAULT_DIAGNOSIS_DAILY_CRON;
  const normalizedValue = configuredValue.toUpperCase() as keyof typeof DIAGNOSIS_DAILY_CRON_MAP;
  const mappedExpression = DIAGNOSIS_DAILY_CRON_MAP[normalizedValue];

  if (mappedExpression) {
    return {
      configuredValue,
      resolvedExpression: mappedExpression,
    };
  }

  if (/\s/.test(configuredValue)) {
    return {
      configuredValue,
      resolvedExpression: configuredValue,
    };
  }

  return {
    configuredValue,
    resolvedExpression: DIAGNOSIS_DAILY_CRON_MAP[DEFAULT_DIAGNOSIS_DAILY_CRON],
  };
}

@Injectable()
export class DiagnosisConfig {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get('DIAGNOSIS_ENABLED', false, { infer: true });
  }

  get questionnaire() {
    const defValue = 'Questionnaire/OralCancerScreenPatient';
    const KEY = 'DIAGNOSIS_QUESTIONNAIRE_REFERENCE';
    return {
      reference: this.config.get<string>(KEY, defValue),
    } as Reference;
  }

  get dentistQuestionnaire() {
    const defValue = 'Questionnaire/OralCancerScreenDentist';
    const KEY = 'DIAGNOSIS_DENTIST_QUESTIONNAIRE_REFERENCE';
    return {
      reference: this.config.get<string>(KEY, defValue),
    } as Reference;
  }

  get instantiateCanonical() {
    const defValue =
      'https://midas.iisc.ac.in/fhir/ActivityDefinition/oral-cancer-screen-patient';
    const KEY = 'DIAGNOSIS_TASK_INSTANTIATE_CANONICAL';
    return this.config.get<string>(KEY, defValue);
  }

  get dentistInstantiateCanonical() {
    const defValue =
      'https://midas.iisc.ac.in/fhir/ActivityDefinition/oral-cancer-screen-dentist';
    const KEY = 'DIAGNOSIS_DENTIST_TASK_INSTANTIATE_CANONICAL';
    return this.config.get<string>(KEY, defValue);
  }

  get followUpTaskUri() {
    const defValue =
      'https://midas.iisc.ac.in/fhir/Task/oral-cancer-screening-follow-up';
    const KEY = 'DIAGNOSIS_TASK_FOLLOW_UP_URI';
    return this.config.get<string>(KEY, defValue);
  }

  get encounterPerCronRun() {
    const KEY = 'DIAGNOSIS_PER_CRON_ENCOUNTER';
    return +this.config.get<number>(KEY);
  }

  get cronLockMinutes() {
    const defValue = 30;
    const KEY = 'DIAGNOSIS_CRON_LOCK_MINUTES';
    return +this.config.get<number>(KEY, defValue);
  }

  get nonSuspiciousCronLockMinutes() {
    const defValue = 8 * 60; // 8 hours
    const KEY = 'DIAGNOSIS_NON_SUSPICIOUS_CRON_LOCK_MINUTES';
    return +this.config.get<number>(KEY, defValue);
  }

  get specialistCronLockMinutes() {
    const defValue = 8 * 60; // 8 hours
    const KEY = 'DIAGNOSIS_SPECIALIST_CRON_LOCK_MINUTES';
    return +this.config.get<number>(KEY, defValue);
  }

  get specialistTaskLimit() {
    const defValue = 25;
    const KEY = 'DIAGNOSIS_SPECIALIST_TASK_LIMIT';
    return +this.config.get<number>(KEY, defValue);
  }

  get specialistSourceTaskIdExtensionUrl() {
    const defValue = 'http://midas.iisc.ac.in/diagnosis-specialist-source-task-id';
    const KEY = 'DIAGNOSIS_SPECIALIST_SOURCE_TASK_ID_EXTENSION_URL';
    return this.config.get<string>(KEY, defValue);
  }

  get specialistReviewQuestionnaire() {
    const defValue = 'Questionnaire/OralCancerReviewPatient';
    const KEY = 'DIAGNOSIS_SPECIALIST_REVIEW_QUESTIONNAIRE_REFERENCE';
    return {
      reference: this.config.get<string>(KEY, defValue),
    } as Reference;
  }

  get specialistReviewInstantiateCanonical() {
    const defValue =
      'https://midas.iisc.ac.in/fhir/ActivityDefinition/oral-cancer-review-patient';
    const KEY = 'DIAGNOSIS_SPECIALIST_REVIEW_TASK_INSTANTIATE_CANONICAL';
    return this.config.get<string>(KEY, defValue);
  }

  get nonSuspiciousDailyCronSchedule() {
    const configuredValue = this.config.get<string>(
      NON_SUSPICIOUS_DAILY_CRON_KEY,
      DEFAULT_DIAGNOSIS_DAILY_CRON
    );
    return resolveDiagnosisDailyCronExpression(configuredValue);
  }

  get specialistDailyCronSchedule() {
    const configuredValue = this.config.get<string>(
      SPECIALIST_DAILY_CRON_KEY,
      DEFAULT_DIAGNOSIS_DAILY_CRON
    );
    return resolveDiagnosisDailyCronExpression(configuredValue);
  }

  get nonSuspiciousOcValue() {
    return 'non-suspicious';
  }

  get nonSuspiciousMinEncounterAgeMs() {
    const defValueHours = 24;
    const KEY = 'DIAGNOSIS_NON_SUSPICIOUS_MIN_ENCOUNTER_AGE_HOURS';
    const hours = +this.config.get<number>(KEY, defValueHours);
    console.log("Hello horus", hours);
    return hours * 60 * 60 * 1000;
  }
}
