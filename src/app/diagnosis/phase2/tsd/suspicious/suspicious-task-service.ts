import { DiagnosisConfig } from '../../../diagnosis-config';
import { Injectable, Logger } from '@nestjs/common';
import {
  Bundle,
  Parameters,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  Task,
} from '@medplum/fhirtypes';
import { DateTime } from 'luxon';
import { resolveId } from '@medplum/core';
import { FhirClient } from '../../../../core/fhir-client';
import { throwOperationOutcome } from '../../../../core/fhir-error';
import { DiagnosisSharedService } from '../../../diagnosis-shared.service';

@Injectable()
export class DiagnosisTaskService {
  private readonly log = new Logger(DiagnosisTaskService.name);

  constructor(
    private readonly config: DiagnosisConfig,
    private readonly source: FhirClient,
    private readonly shared: DiagnosisSharedService
  ) {}
  

  /**
   * Create diagnosis task for all encounter till we don't have any pending
   * encounter to processed
   */
  async processAll(opt?: { count?: number; chunked?: boolean }) {
    const { count, chunked } = opt ?? {};
    this.log.debug(
      'Create Diagnosis task for suspicious and referred non-suspicious encounters'
    );

    const suspiciousEncounterIds = await this.loadEncounterIds({
      status: 'planned,arrived,triaged',
      'oc-overall': 'suspicious',
      _elements: 'id',
      _count: count ?? 1000, // By Default only 20 is picked up, we will load 1000
    });

    const referredNonSuspiciousEncounterIds = await this.loadEncounterIds({
      status: 'planned,arrived,triaged',
      'oc-overall': 'non-suspicious',
      'subject._has:QuestionnaireResponse:subject:refer-case': 'true',
      _elements: 'id',
      _count: count ?? 1000,
    });

    const encounterIds = [
      ...new Set([
        ...suspiciousEncounterIds,
        ...referredNonSuspiciousEncounterIds,
      ]),
    ];

    this.log.log(
      `Encounter loaded ${encounterIds.length} (suspicious=${suspiciousEncounterIds.length}, referredNonSuspicious=${referredNonSuspiciousEncounterIds.length})`
    );

    // Perform parallel with a chunk of 10
    if (chunked) {
      for (let i = 0; i < encounterIds.length; i += 10) {
        const chunk = encounterIds.slice(i, i + 10);
        await Promise.allSettled(chunk.map((id) => this.create(id)));
      }
      return;
    }

    // Perform sequentially
    for (const id of encounterIds) {
      await this.create(id).catch();
    }
    this.log.log(`Processed all encounter`);
  }

  private async loadEncounterIds(params: Record<string, unknown>) {
    const bundle = await this.source.search('Encounter', params);
    return (
      bundle.entry
        ?.map((entry) => entry.resource?.id)
        .filter((id): id is string => Boolean(id)) ?? []
    );
  }

  /**
   * Create diagnosis task for a given encounter. This will ensure that
   * no duplicate task is created for given encounter
   * @param encounterId
   */
  async create(encounterId: string) {
    this.log.log('Create Diagnosis task', { encounterId });
    const { everything, encounter } = await this.shared.loadInitialData(encounterId);

    // Check Task has not already been created
    if (this.shared.hasTaskAlreadyGenerated(everything)) {
      this.log.log('Task already generated for the encounter', { encounterId });
      return;
    }

    // Find all the document for the encounter
    const { documentIds, allDocIdValid } = this.shared.isAllDocumentValid(everything);
    if (!allDocIdValid) {
      this.log.error(
        'All document id not found/invalid. This should not happen',
        { encounterId }
      );
      return;
    }

    // Check all doc Uploaded
    const docsUploaded = await this.shared.isDocumentUploaded(documentIds);
    if (!docsUploaded) {
      return;
    }

    const assignee = await this.shared.findSpecialist('dentist');
    this.log.log("Assignee found for dentist", assignee);
    if (!assignee) {
      this.log.log('Cannot find specialist to assign');
      return;
    }

    console.log('Assigning suspicious encounter to dentist', { encounterId, dentist: assignee.reference });
    // Find all the Specialist with the least Task assigned
    const resources = this.shared.prepareDiagnosisResources(encounter, assignee, this.config.dentistQuestionnaire, this.config.dentistInstantiateCanonical);
    await this.shared.pushResource(resources, encounterId, this.config.dentistInstantiateCanonical);
  }

  /**
   * Submit the diagnosis task response as task completion either by specialist
   * or senior specialist. It can be moved to senior specialist if the
   * current practitioner is a specialist
   * @param parameters
   * @param practitioner
   */
  async submit(parameters: Parameters, practitioner: Practitioner) {
    // Extract the action "submit/second-opinion"
    const action =
      parameters.parameter.find((p) => p.name === 'action')?.valueString ??
      throwOperationOutcome('error', 'incomplete', 'Missing Action');

    // Extract the task
    const taskRef = parameters.parameter.find(
      (p) => p.name === 'task'
    )?.valueReference;
    const taskId =
      resolveId(taskRef) ??
      throwOperationOutcome('error', 'incomplete', 'Missing Task');

    const task = await this.source
      .read('Task', taskId)
      .catch(() => throwOperationOutcome('error', 'unknown', 'Missing Task'));

    // Check if the user is permitted to make changes
    if (resolveId(task.owner) !== practitioner.id) {
      throwOperationOutcome(
        'error',
        'forbidden',
        'You are not allowed to perform this action'
      );
    }

    if (task.status === 'completed') {
      throwOperationOutcome('error', 'invalid', 'Task already completed');
    }

    switch (action) {
      case 'submit':
        return await this.submitDiagnosis(task, parameters);
      case 'second-opinion':
        return await this.moveToSecondOpinion(task);
      default:
        throwOperationOutcome('error', 'code-invalid', 'Invalid action');
    }
  }

  /**
   * Submit the diagnosis task with a questionnaire response
   * @param task
   * @param parameters
   * @private
   */
  private async submitDiagnosis(task: Task, parameters: Parameters) {
    // This is a task submission, we will look for response
    // Questionnaire Response
    const qr =
      (parameters.parameter.find(
        (p) =>
          p.name === 'questionnaire-response' &&
          p.resource?.resourceType === 'QuestionnaireResponse'
      )?.resource as QuestionnaireResponse) ??
      throwOperationOutcome('error', 'incomplete', 'Missing QResponse');

    const encounterId = qr.encounter?.reference?.split('/')?.[1];
    const { everything, encounter } = await this.shared.loadInitialData(encounterId);

    // Extract the response from the questionnaire response
    const resource = await this.source.resourceOp(
      'QuestionnaireResponse',
      '$extract',
      parameters as unknown as Record<string, unknown>
    );

    const followUpTaskUri = this.config.followUpTaskUri;
    const followUpTask = resource.entry.find(
      (r) =>
        r.resource.resourceType === 'Task' &&
        r.resource.instantiatesUri === followUpTaskUri
    )?.resource as Task;

    // Check if this is a TSCC (Tele-Specialist) task
    // TSCC tasks should not create follow-up tasks
    const isTscTask = task.instantiatesCanonical === this.config.specialistReviewInstantiateCanonical;

    // 1. Update the task status to be completed
    task.status = 'completed';

    // 2. In case the follow-up task exist, we will need to assign it the FLW back
    // But only if this is NOT a TSCC task
    if (followUpTask && !isTscTask) {
      const patient =
        (everything.entry.find((e) => e.resource.resourceType === 'Patient')
          ?.resource as Patient) ??
        throwOperationOutcome('error', 'incomplete', 'Missing Patient');
      const practitioner =
        patient.generalPractitioner?.[0] ??
        encounter.participant?.[0].individual;

      if (practitioner?.reference.startsWith('Practitioner/')) {
        followUpTask.owner = practitioner;
      }
    }

    // If this is a TSCC task, filter out the follow-up task from the extracted resources
    let filteredResourceEntry = resource.entry;
    if (isTscTask && followUpTask) {
      filteredResourceEntry = resource.entry.filter(
        (r) =>
          !(
            r.resource.resourceType === 'Task' &&
            r.resource.instantiatesUri === followUpTaskUri
          )
      );
      this.log.log('Filtered out follow-up task for TSCC task', { taskId: task.id });
    }

    // 3. Mark the encounter to be finished,so all the post encounter work
    // can be started
    encounter.status = 'finished';

    // 4. Save the changes
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        ...filteredResourceEntry,
        {
          resource: qr,
          request: {
            url: [qr.resourceType, qr.id].join('/'),
            method: 'PUT',
          },
        },
        {
          resource: task,
          request: {
            url: [task.resourceType, task.id].join('/'),
            method: 'PUT',
          },
        },
        {
          resource: encounter,
          request: {
            url: [encounter.resourceType, encounter.id].join('/'),
            method: 'PUT',
          },
        },
      ],
    } as Bundle;
    await this.source.transaction(bundle);
    this.log.log('Successfully submitted diagnosis', { encounterId });
  }

  private async moveToSecondOpinion(task: Task) {
    // Re-assign it to senior specialist
    task.owner =
      (await this.shared.findSpecialist('senior-specialist')) ??
      throwOperationOutcome('error', 'processing', 'No senior specialist');
    task.lastModified = DateTime.now().toISO();
    await this.source.upsert(task);
    this.log.log('Task moved to second opinion');
  }
}
