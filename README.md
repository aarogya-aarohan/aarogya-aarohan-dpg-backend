# Arogyam Backend

Arogyam Backend is a NestJS service for the Arogyam oral cancer screening workflows. It integrates with external FHIR services to manage diagnosis tasks, reader/image-labelling tasks, upload status, analytics, and scheduled data export. The repository uses TypeScript, Nx, and pnpm.

## Prerequisites

- Node.js 22, matching the repository's Docker build/runtime major version.
- pnpm 9 (the committed lockfile uses format 9.0).
- Git, including access to GitHub-hosted dependencies.
- An accessible source FHIR server and an OAuth identity provider such as the existing Keycloak deployment, with a service client permitted to perform the required FHIR operations.
- A separately configured destination FHIR service and credentials if external export is enabled.
- Docker only if building the container image.

Provision FHIR and authentication services separately; this repository does not include them. Obtain URLs and credentials from your deployment administrator.

## Local setup

Run commands from the repository root.

### 1. Install dependencies

```sh
node --version
COREPACK_ENABLE_AUTO_PIN=0 pnpm --version
COREPACK_ENABLE_AUTO_PIN=0 pnpm install --frozen-lockfile
```

Use the committed lockfile. `COREPACK_ENABLE_AUTO_PIN=0` prevents Corepack from modifying `package.json` automatically.

### 2. Configure the environment

For a new checkout without an existing `.env`:

```sh
cp .env.sample .env
```

Edit `.env` before using any data-processing workflows:

1. Set `FHIR_BASE_URL`, `FHIR_TOKEN_URL`, `FHIR_CLIENT_ID`, and `FHIR_CLIENT_SECRET` for the source service.
2. Keep `PORT=3000`, or choose another available port.
3. Review the workflow resource references and canonical URLs against resources installed in your FHIR server.
4. Configure export destination settings before enabling export. The sample points source and destination at the same local FHIR URL; replace it with the intended destination.

The sample uses placeholder credentials and enables reader/upload-status processing. For initial setup, set `READER_ENABLED=false`, `UPLOAD_STATUS_ENABLED=false`, and `UPLOAD_STATUS_APPLY=false` until dependencies are configured. Diagnosis and export are already disabled. Keep credentials in the Git-ignored `.env` file.

Process environment values override `.env`. Fields required by [config-schema.ts](src/app/core/config-schema.ts) must remain populated even when jobs are disabled. The reference below also includes optional code-level settings absent from the sample.

### 3. Run the development server

```sh
COREPACK_ENABLE_AUTO_PIN=0 pnpm exec nx serve arogyam
```

After the application starts successfully with `PORT=3000`:

- API route prefix: `/api` (not a standalone endpoint; `GET /api` returns 404).
- Example API endpoint: `http://localhost:3000/api/sites`
- Swagger UI: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`

`/api/sites` returns [static site configuration](src/app/site/site.controller.ts), not a FHIR connectivity check. Its URLs are independent of `FHIR_BASE_URL`.

Keep `PORT` explicit: the current HTTP bootstrap falls back to port 300 when it is absent.

## Environment reference

Values below describe sample values or code defaults. Use `true`/`false` for boolean flags and restart after changing configuration.

### Application and source services

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP listener port; sample sets 3000 explicitly. |
| `FHIR_BASE_URL` | Source FHIR API base URL. |
| `FHIR_TOKEN_URL` | Source OAuth token endpoint. |
| `FHIR_CLIENT_ID`, `FHIR_CLIENT_SECRET` | Source service client credentials. |

The sample Keycloak URLs use `/auth/realms/arogyam/...`; this path is deployment-specific. Use the actual token endpoints for your installation.

### Diagnosis workflows

| Variable | Purpose / sample value |
| --- | --- |
| `DIAGNOSIS_ENABLED` | Enables diagnosis scheduled jobs; sample `false`. |
| `DIAGNOSIS_QUESTIONNAIRE_REFERENCE` | Screening questionnaire reference. |
| `DIAGNOSIS_TASK_INSTANTIATE_CANONICAL` | Screening task ActivityDefinition canonical URL. |
| `DIAGNOSIS_TASK_FOLLOW_UP_URI` | Follow-up task URI. |
| `DIAGNOSIS_PER_CRON_ENCOUNTER` | Configured encounter batch size; sample 100. |
| `DIAGNOSIS_CRON_LOCK_MINUTES` | Diagnosis lock duration; sample 30 minutes. |
| `DIAGNOSIS_DENTIST_QUESTIONNAIRE_REFERENCE` | Dentist questionnaire override. |
| `DIAGNOSIS_DENTIST_TASK_INSTANTIATE_CANONICAL` | Dentist ActivityDefinition override. |
| `DIAGNOSIS_NON_SUSP_PERCENT` | Percentage used to select eligible non-suspicious encounters; sample 5; set explicitly. |
| `DIAGNOSIS_NON_SUSPICIOUS_CRON_LOCK_MINUTES` | Non-suspicious job lock duration; default/sample 480 minutes. |
| `DIAGNOSIS_NON_SUSPICIOUS_MIN_ENCOUNTER_AGE_HOURS` | Minimum age for eligible encounters; default/sample 24 hours. |
| `DIAGNOSIS_NON_SUSPICIOUS_DAILY_CRON_EXPRESSION` | Non-suspicious schedule; default/sample `EVERY_DAY_AT_6PM`. |
| `DIAGNOSIS_SPECIALIST_DAILY_CRON_EXPRESSION` | Tele-specialist schedule; default/sample `EVERY_DAY_AT_6PM`. |
| `DIAGNOSIS_SPECIALIST_CRON_LOCK_MINUTES` | Specialist lock duration; default/sample 480 minutes. |
| `DIAGNOSIS_SPECIALIST_TASK_LIMIT` | Specialist task limit; default/sample 25. |
| `DIAGNOSIS_SPECIALIST_SOURCE_TASK_ID_EXTENSION_URL` | Extension URL linking a specialist task to its source task. |
| `DIAGNOSIS_SPECIALIST_REVIEW_QUESTIONNAIRE_REFERENCE` | Specialist review questionnaire reference. |
| `DIAGNOSIS_SPECIALIST_REVIEW_TASK_INSTANTIATE_CANONICAL` | Specialist review ActivityDefinition canonical URL. |

Non-suspicious and tele-specialist diagnosis jobs default to 6 PM daily. Override their schedules with the two daily cron variables above, for example `"0 0 18 * * *"`.

### Reader and upload status

| Variable | Purpose / sample value |
| --- | --- |
| `READER_ENABLED` | Enables scheduled reader task generation; sample `true`; set false for initial setup. |
| `READER_PER_CRON_MEDIA` | Media batch size; sample 1. |
| `READER_CRON_LOCK_MINUTES` | Reader lock duration; sample 1 minute. |
| `READER_TASK_INTERVAL_DAYS` | Interval between reader task stages; sample 30 days. |
| `READER_TASK_INSTANTIATE_CANONICAL` | Image-labelling ActivityDefinition override. |
| `READER_TASK_URI` | Image-labelling task URI override. |
| `READER_QUESTIONNAIRE_REFERENCE` | Image-labelling questionnaire override. |
| `UPLOAD_STATUS_ENABLED` | Enables scheduled upload-status evaluation; sample `true`; set false for initial setup. |
| `UPLOAD_STATUS_CRON_LOCK_MINUTES` | Upload-status lock duration; sample 2880 minutes. |
| `UPLOAD_STATUS_APPLY` | Enables persistence of evaluated upload-status updates; sample `true`; set false for initial setup. |

Enable flags control scheduled processing; they do not provide HTTP route authentication.

### External data export

| Variable | Purpose / sample value |
| --- | --- |
| `EXPORT_ENABLED` | Enables scheduled export only when explicitly true; defaults to false if absent. |
| `EXPORT_SITE_ID` | Site identifier attached to exported resources; sample `site-2`; replace with your site identifier. |
| `EXPORT_FHIR_URL` | Destination FHIR base URL. |
| `EXPORT_TOKEN_URL` | Destination OAuth token endpoint. |
| `EXPORT_CLIENT_ID`, `EXPORT_CLIENT_SECRET` | Destination service credentials. |
| `EXPORT_PER_CRON_ENCOUNTER` | Maximum encounters processed per scheduled run; sample 1. |
| `EXPORT_CRON_LOCK_MINUTES` | Export lock duration; sample 5 minutes. |

Scheduled export selects finished encounters not already tagged as successfully exported, transfers resources using destination service credentials, and updates source export-status tags.

Set `EXPORT_ENABLED=true` to enable export. False or missing values disable it. There is no manual `POST /api/export` endpoint. No additional Keycloak role or audience mapper is required; existing source and destination service permissions are still needed.

## Configurable cron schedules

These optional environment variables override the five job schedules at startup:

| Variable | Default when unset or blank |
| --- | --- |
| `DIAGNOSIS_PHASE1_CRON_EXPRESSION` | Every 5 minutes (`0 */5 * * * *`) |
| `DIAGNOSIS_SUSPICIOUS_CRON_EXPRESSION` | Every 5 minutes (`0 */5 * * * *`) |
| `READER_CRON_EXPRESSION` | Every minute (`0 * * * * *`) |
| `UPLOAD_STATUS_CRON_EXPRESSION` | Every minute (`0 * * * * *`) |
| `EXPORT_CRON_EXPRESSION` | Every minute (`0 * * * * *`) |

Use five-field cron expressions, or six fields with seconds first. For example:

```dotenv
EXPORT_CRON_EXPRESSION="0 */10 * * * *"
```

This runs export every ten minutes when enabled. These five settings require cron expressions rather than `EVERY_*` aliases. Invalid expressions fail startup with the variable name in the error.

All schedules use the runtime timezone and require a restart after changes. Enable flags, lock durations, and batch limits remain independent of frequency.

## Build and run for production

```sh
COREPACK_ENABLE_AUTO_PIN=0 pnpm exec nx build arogyam
node dist/arogyam/main.js
```

Run from the repository root with dependencies installed and runtime configuration supplied through environment variables or `.env`. The build writes to `dist/arogyam`; copying `main.js` alone is insufficient because runtime dependencies are external to the bundle.

For environments where Nx daemon or plugin isolation is unavailable:

```sh
COREPACK_ENABLE_AUTO_PIN=0 NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NO_CLOUD=true pnpm exec nx build arogyam --skip-nx-cache
```

### Docker

The existing multi-stage Dockerfile builds with Node.js 22 and runs on a distroless Node.js 22 image:

```sh
docker build -t arogyam-backend .
docker run --rm --name arogyam-backend --env-file .env -p 3000:3000 arogyam-backend
```

Use `PORT=3000` for this port mapping. `.env` is excluded from the build context and supplied at runtime. Inside a container, `localhost` refers to that container: replace the sample source/destination URLs with addresses reachable from the container. The image does not include FHIR or Keycloak.

## Validation

Run TypeScript checks, then the production build above:

```sh
COREPACK_ENABLE_AUTO_PIN=0 pnpm exec tsc --noEmit -p tsconfig.app.json
COREPACK_ENABLE_AUTO_PIN=0 pnpm exec tsc --noEmit -p tsconfig.spec.json
```

For export deployment verification, use synthetic staging records and confirm destination receipt and source status updates. The removed manual route should return 404.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/main.ts` | HTTP bootstrap and Swagger setup. |
| `src/app/core/` | Configuration schema, FHIR client, logging, and cron locking. |
| `src/app/auth/` | Authentication provider and session/permission types. |
| `src/app/diagnosis/` | Phase 1 and phase 2 diagnosis workflows. |
| `src/app/reader/` | Reader tasks, inference, and analytics/report endpoints. |
| `src/app/export/` | Scheduled external export. |
| `src/app/upload-status/` | Upload-status evaluation and scheduler. |
| `src/app/site/` | Static site configuration endpoint. |
| `igs/arogyam/` | FHIR artifacts, questionnaires, maps, and related definitions. |
| `e2e/` | Separate end-to-end test harness. |
| `project.json`, `webpack.config.js` | Nx targets and build configuration. |

FHIR artifacts are not automatically installed by `pnpm install` or application startup. Provision the definitions required by your enabled workflows on the FHIR server through your environment's deployment process.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Configuration validation fails | Compare `.env` with `.env.sample`; required fields remain required when jobs are disabled. |
| Service listens on an unexpected port | Set `PORT` explicitly and restart. |
| Token requests fail or FHIR returns 401/403 | Verify token endpoint, service credentials, and source/destination permissions separately. |
| Scheduled export does nothing | Check `EXPORT_ENABLED=true`, eligible finished encounters, existing export-status tags, batch size, and lock/log state. |
| Manual export returns 404 | Expected: export is scheduled-only. |
| A job runs at the wrong time | Check the runtime timezone and the configured cron expression. Lock minutes do not control frequency. |
| Dependency install requests GitHub SSH access | Check Git transport configuration and network access; the repository includes a GitHub-hosted type dependency. |
| Nx hangs in a constrained environment | Use the daemon/plugin-isolation-disabled build command above. |

Licensed under the [Apache License, Version 2.0](LICENSE).
