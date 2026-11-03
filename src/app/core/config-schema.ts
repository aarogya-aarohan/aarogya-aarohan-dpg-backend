import Joi from 'joi';

export const CONFIG_SCHEMA = Joi.object({
  PORT: Joi.number().default(3000),

  FHIR_BASE_URL: Joi.string().required(),
  FHIR_TOKEN_URL: Joi.string().required(),
  FHIR_CLIENT_ID: Joi.string().required(),
  FHIR_CLIENT_SECRET: Joi.string().required(),

  DIAGNOSIS_ENABLED: Joi.boolean().required(),
  DIAGNOSIS_PHASE1_CRON_EXPRESSION: Joi.string().trim().allow('').optional(),
  DIAGNOSIS_SUSPICIOUS_CRON_EXPRESSION: Joi.string().trim().allow('').optional(),
  DIAGNOSIS_QUESTIONNAIRE_REFERENCE: Joi.string().required(),
  DIAGNOSIS_TASK_INSTANTIATE_CANONICAL: Joi.string().required(),
  DIAGNOSIS_TASK_FOLLOW_UP_URI: Joi.string().required(),
  DIAGNOSIS_PER_CRON_ENCOUNTER: Joi.number().required(),
  DIAGNOSIS_CRON_LOCK_MINUTES: Joi.number().required(),
  DIAGNOSIS_NON_SUSPICIOUS_DAILY_CRON_EXPRESSION: Joi.string().optional(),
  DIAGNOSIS_SPECIALIST_DAILY_CRON_EXPRESSION: Joi.string().optional(),
  DIAGNOSIS_NON_SUSPICIOUS_MIN_ENCOUNTER_AGE_HOURS: Joi.number().optional(),
  DIAGNOSIS_SPECIALIST_REVIEW_QUESTIONNAIRE_REFERENCE: Joi.string().optional(),
  DIAGNOSIS_SPECIALIST_REVIEW_TASK_INSTANTIATE_CANONICAL: Joi.string().optional(),

  EXPORT_ENABLED: Joi.boolean().default(false),
  EXPORT_CRON_EXPRESSION: Joi.string().trim().allow('').optional(),
  EXPORT_PER_CRON_ENCOUNTER: Joi.number().required(),
  EXPORT_SITE_ID: Joi.string().required(),
  EXPORT_FHIR_URL: Joi.string().required(),
  EXPORT_TOKEN_URL: Joi.string().required(),
  EXPORT_CLIENT_ID: Joi.string().required(),
  EXPORT_CLIENT_SECRET: Joi.string().required(),
  EXPORT_CRON_LOCK_MINUTES: Joi.number().required(),

  READER_ENABLED: Joi.boolean().required(),
  READER_CRON_EXPRESSION: Joi.string().trim().allow('').optional(),
  READER_PER_CRON_MEDIA: Joi.number().required(),
  READER_CRON_LOCK_MINUTES: Joi.number().required(),
  READER_TASK_INTERVAL_DAYS: Joi.number().required(),

  UPLOAD_STATUS_ENABLED: Joi.boolean().required(),
  UPLOAD_STATUS_CRON_EXPRESSION: Joi.string().trim().allow('').optional(),
  UPLOAD_STATUS_CRON_LOCK_MINUTES: Joi.number().required(),
  UPLOAD_STATUS_APPLY: Joi.boolean().required(),

});
