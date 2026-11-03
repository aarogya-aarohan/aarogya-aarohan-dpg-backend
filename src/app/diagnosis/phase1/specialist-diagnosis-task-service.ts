import { DiagnosisConfig } from '../diagnosis-config';
import { Injectable, Logger } from '@nestjs/common';
import {
  Bundle,
  Encounter,
  Media,
  Parameters,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  Reference,
  Resource,
  Task,
  DocumentReference,
} from '@medplum/fhirtypes';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { resolveId } from '@medplum/core';
import { FhirClient } from '../../core/fhir-client';
import _ from 'lodash';
import { throwOperationOutcome } from '../../core/fhir-error';

const PERM_FAIL_URL = 'https://midas.iisc.ac.in/fhir/StructureDefinition/img-upload-failed-permanently';
const PERM_FAIL_VALUE = 'IMG_UPLOAD_FAILED_PERMANENTLY';

@Injectable()
export class SpecialistDiagnosisTaskService {
  private readonly log = new Logger(SpecialistDiagnosisTaskService.name);

  constructor(
    private readonly config: DiagnosisConfig,
    private readonly source: FhirClient
  ) {}
  

  /**
   * Create diagnosis task for all encounter till we don't have any pending
   * encounter to processed
   */
  async processAll(opt?: { count?: number; chunked?: boolean }) {
    const { count, chunked } = opt ?? {};
    this.log.debug('Create Diagnosis task for all');
    let encounterIds = await this.source
      .search('Encounter', {
        status: 'planned,arrived,triaged',
        'oc-overall:missing': 'true',
        _elements: 'id',
        _count: count ?? 1000, // By Default only 20 is picked up, we will load 1000
      })
      .then((e) => e.entry?.map((e) => e.resource?.id));

    encounterIds = _.shuffle(encounterIds);
    this.log.log(`Encounter loaded ${encounterIds.length}`);

    // Perform parallel with a chunk of 10
    if (chunked) {
      for (const chunk of _.chunk(encounterIds, 10)) {
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

  /**
   * Create diagnosis task for a given encounter. This will ensure that
   * no duplicate task is created for given encounter
   * @param encounterId
   */
  async create(encounterId: string) {
    this.log.log('Create Diagnosis task', { encounterId });
    const { everything, encounter } = await this.loadInitialData(encounterId);

    // Check Task has not already been created
    if (this.hasTaskAlreadyGenerated(everything)) {
      this.log.log('Task already generated for the encounter', { encounterId });
      return;
    }

    // Find all the document for the encounter
    const { documentIds, allDocIdValid } = this.isAllDocumentValid(everything);
    if (!allDocIdValid) {
      this.log.error(
        'All document id not found/invalid. This should not happen',
        { encounterId }
      );
      return;
    }

    // Check all doc Uploaded
    const docsUploaded = await this.isDocumentUploaded(documentIds);
    if (!docsUploaded) {
      this.log.log('All document not yet uploaded ', { encounterId });
      return;
    }

    const specialist = await this.findSpecialist('specialist');
    if (!specialist) {
      this.log.log('Cannot find specialist to assign');
      return;
    }

    // Find all the Specialist with the least Task assigned
    const resources = this.prepareDiagnosisResources(encounter, specialist);
    await this.pushResource(resources, encounterId);
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
    const { everything, encounter } = await this.loadInitialData(encounterId);

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

    // 1. Update the task status to be completed
    task.status = 'completed';

    // 2. In case the follow-up task exist, we will need to assign it the FLW back
    if (followUpTask) {
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

    // 3. Mark the encounter to be finished,so all the post encounter work
    // can be started
    encounter.status = 'finished';

    // 4. Save the changes
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        ...resource.entry,
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
      (await this.findSpecialist('senior-specialist')) ??
      throwOperationOutcome('error', 'processing', 'No senior specialist');
    task.lastModified = DateTime.now().toISO();
    await this.source.upsert(task);
    this.log.log('Task moved to second opinion');
  }

  /**
   * Load the all the data related with the encounter and check if we need to
   * proceed with creation of diagnosis task
   * @param encounterId
   * @private
   */
  private async loadInitialData(encounterId: string) {
    const everything = await this.source.instanceOp(
      'Encounter',
      encounterId,
      '$everything',
      undefined,
      { _count: 100 }
    );
    const encounter = everything.entry
      .map((e) => e.resource)
      .find((r) => r.resourceType === 'Encounter');
    if (!encounter) throw new Error('No encounter found for this resource');
    return { everything, encounter };
  }

  private prepareDiagnosisResources(
    encounter: Encounter,
    specialist: Reference<Practitioner>
  ) {
    const questionnaire = this.config.questionnaire;
    const now = DateTime.now().toISO();
    const task = {
      id: randomUUID(),
      resourceType: 'Task',
      instantiatesCanonical: this.config.instantiateCanonical,
      description: 'Task for specialist to screen patient',
      owner: specialist,
      focus: questionnaire,
      status: 'requested',
      intent: 'order',
      priority: 'routine',
      authoredOn: now,
      lastModified: now,
      for: encounter.subject,
      encounter: { reference: ['Encounter', encounter.id].join('/') },
      code: {
        coding: [
          {
            code: 'fulfill',
            system: 'http://hl7.org/fhir/CodeSystem/task-code',
            display: 'Fulfill the focal request',
          },
        ],
      },
    } satisfies Task;
    encounter.status = 'in-progress';
    return [encounter, task] as Resource[];
  }

  private async isDocumentUploaded(documentIds: string[]) {
    const results = await Promise.all(documentIds.map((id) => this.isDocUploaded(id)));
    const total = results.length;
    const uploaded = results.filter(r => r.uploaded).length;
    const permFail = results.filter(r => !r.uploaded && r.permanentFailure).length;

    if (uploaded === total) return true;
    if (uploaded + permFail === total) return true;
    return false;
  }

  private async isDocUploaded(docId: string) {
    try {
      const bundle = await this.source.search('DocumentReference', {
        _id: docId,
        _count: 1,
        _elements: 'extension,content.attachment.size',
      }) as Bundle<DocumentReference>;
      const doc = bundle.entry?.[0]?.resource as DocumentReference | undefined;
      if (!doc) return { uploaded: false, permanentFailure: false };
      const exts = (doc as any).extension as any[] | undefined;
      const permanentFailure =
        Array.isArray(exts) &&
        exts.some(
          (e) =>
            e?.url === PERM_FAIL_URL &&
            e?.valueString === PERM_FAIL_VALUE
        );
      const parts = doc.content ?? [];
      const uploaded =
        parts.some((p) => typeof p?.attachment?.size === 'number' && p.attachment.size > 0);
      return { uploaded, permanentFailure };
    } catch {
      this.log.error('Failed to load document', { docId });
      return { uploaded: false, permanentFailure: false };
    }
  }

  private isAllDocumentValid(everything: Bundle) {
    const documentIds = this.findDocIds(everything);
    const allDocIdValid = documentIds.every((s) => s);
    return { documentIds, allDocIdValid };
  }

  private hasTaskAlreadyGenerated(everything: Bundle) {
    const instantiateCanonical = this.config.instantiateCanonical;
    return everything.entry
      .map((e) => e.resource)
      .filter((r) => r.resourceType === 'Task')
      .some((t) => t.instantiatesCanonical === instantiateCanonical);
  }

  private findDocIds(everything: Bundle) {
    return everything.entry
      .map((e) => e.resource)
      .filter((r) => r.resourceType === 'Media')
      .map((r) => r as Media)
      .map((m) => this.extractId(m.content?.url));
  }

  private extractId(url?: string) {
    if (!url) return null;
    const parts = url.split('DocumentReference/');
    if (parts.length < 2) return null;
    const idPart = parts[1].split('/');
    if (idPart.length == 0) return null;
    return idPart[0];
  }

  private async pushResource(resources: Resource[], encounterId: string) {
    const { everything } = await this.loadInitialData(encounterId);
    if (this.hasTaskAlreadyGenerated(everything)) {
      this.log.log('Not pushing the resource as it has been created in the meanwhile');
      return;
    }
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: resources.map((r) => ({
        resource: r,
        request: { url: [r.resourceType, r.id].join('/'), method: 'PUT' },
      })),
    } as Bundle;
    await this.source.transaction(bundle);
    this.log.log('Encounter processed for patient care', { encounterId });
  }

  private async findSpecialist(code: 'specialist' | 'senior-specialist' | 'tele-specialist') {
    const roles = await this.source
      .search('PractitionerRole', {
        active: true,
        role: [
          'https://midas.iisc.ac.in/fhir/CodeSystem/practitioner-role-type',
          code,
        ].join('|'),
      })
      .then((b) => b.entry.map((e) => e.resource));
    const taskCountPromises = roles.map(async (r) => {
      if (!r.practitioner?.reference) return null;
      const id = resolveId(r.practitioner);
      try {
        await this.source.read('Practitioner', id);
      } catch (e) {
        this.log.error('Cannot find practitioner', e);
        return { reference: r.practitioner, count: 0, can: false };
      }
      const bundle = await this.source.search('Task', {
        owner: r.practitioner.reference,
        status: 'requested',
        _summary: 'count',
      });
      return { reference: r.practitioner, count: bundle.total ?? 0, can: true };
    });
    const taskCount = await Promise.all(taskCountPromises);
    return taskCount
      .filter((t) => t.can)
      .filter((t) => t)
      .sort((a, b) => a.count - b.count)?.[0]?.reference;
  }
}
