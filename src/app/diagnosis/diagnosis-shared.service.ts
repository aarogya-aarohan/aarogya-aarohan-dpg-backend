import { Injectable, Logger } from '@nestjs/common';
import {
  Bundle,
  DocumentReference,
  Encounter,
  Media,
  Practitioner,
  Reference,
  Resource,
  Task,
} from '@medplum/fhirtypes';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { resolveId } from '@medplum/core';
import { FhirClient } from '../core/fhir-client';
import { DiagnosisConfig } from './diagnosis-config';

const PERM_FAIL_URL = 'https://midas.iisc.ac.in/fhir/StructureDefinition/img-upload-failed-permanently';
const PERM_FAIL_VALUE = 'IMG_UPLOAD_FAILED_PERMANENTLY';

@Injectable()
export class DiagnosisSharedService {
  private readonly log = new Logger(DiagnosisSharedService.name);

  constructor(
    private readonly config: DiagnosisConfig,
    private readonly source: FhirClient
  ) {}

  async loadInitialData(encounterId: string) {
    const everything = await this.source.instanceOp(
      'Encounter',
      encounterId,
      '$everything',
      undefined,
      { _count: 100 }
    );
    const encounter = everything.entry
      .map((e) => e.resource)
      .find((r) => r.resourceType === 'Encounter') as Encounter | undefined;
    if (!encounter) throw new Error('No encounter found for this resource');
    return { everything, encounter };
  }

  hasTaskAlreadyGenerated(everything: Bundle, instantiateCanonical?: string) {
    const instantiateCanonicalToUse = instantiateCanonical ?? this.config.instantiateCanonical;
    return everything.entry
      .map((e) => e.resource)
      .filter((r) => r.resourceType === 'Task')
      .some((t) => t.instantiatesCanonical === instantiateCanonicalToUse);
  }

  isAllDocumentValid(everything: Bundle) {
    const rawDocumentIds = this.findDocIds(everything);
    const allDocIdValid = rawDocumentIds.every((s) => s);
    const documentIds = rawDocumentIds.filter((id): id is string => Boolean(id));
    return { documentIds, allDocIdValid };
  }

  async isDocumentUploaded(documentIds: string[]) {
    const results = await Promise.all(documentIds.map((id) => this.isDocUploaded(id)));
    const total = results.length;
    const uploaded = results.filter((r) => r.uploaded).length;
    const permFail = results.filter((r) => !r.uploaded && r.permanentFailure).length;

    if (uploaded === total) return true;
    if (uploaded + permFail === total) return true;
    return false;
  }

  prepareDiagnosisResources(
    encounter: Encounter,
    specialist: Reference<Practitioner>,
    questionnaire?: Reference,
    instantiateCanonical?: string
  ) {
    const questionnaireToUse = questionnaire ?? this.config.questionnaire;
    const instantiateCanonicalToUse = instantiateCanonical ?? this.config.instantiateCanonical;
    const now = DateTime.now().toISO();
    const task = {
      id: randomUUID(),
      resourceType: 'Task',
      instantiatesCanonical: instantiateCanonicalToUse,
      description: 'Task for specialist to screen patient',
      owner: specialist,
      focus: questionnaireToUse,
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

  async pushResource(resources: Resource[], encounterId: string, instantiateCanonical?: string) {
    const { everything } = await this.loadInitialData(encounterId);
    if (this.hasTaskAlreadyGenerated(everything, instantiateCanonical)) {
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
  }

  async findSpecialists(code: 'specialist' | 'senior-specialist' | 'dentist' | 'tele-specialist') {
    return await this.loadActivePractitionerByRole(code);
  }

  async findSpecialist(code: 'specialist' | 'senior-specialist' | 'dentist' | 'tele-specialist') {
    const practitioners = await this.findSpecialists(code);
    const taskCountPromises = practitioners.map(async (practitionerRef) => {
      const bundle = await this.source.search('Task', {
        owner: practitionerRef.reference,
        status: 'requested',
        _summary: 'count',
      });
      return { reference: practitionerRef, count: bundle.total ?? 0 };
    });
    const taskCount = await Promise.all(taskCountPromises);
    return taskCount
      .filter((t): t is { reference: Reference<Practitioner>; count: number } => Boolean(t))
      .sort((a, b) => a.count - b.count)?.[0]?.reference;
  }

  private async loadActivePractitionerByRole(
    code: 'specialist' | 'senior-specialist' | 'dentist' | 'tele-specialist'
  ) {
    const role = [
      'https://midas.iisc.ac.in/fhir/CodeSystem/practitioner-role-type',
      code,
    ].join('|');

    const pageSize = 200;
    let offset = 0;
    const practitionerReferences: Reference<Practitioner>[] = [];

    while (true) {
      const bundle = await this.source.search('PractitionerRole', {
        active: true,
        role,
        _count: pageSize,
        _getpagesoffset: offset,
      });

      const entries = bundle?.entry ?? [];
      if (entries.length === 0) break;

      for (const entry of entries) {
        const roleResource = entry.resource as
          | { practitioner?: Reference<Practitioner> }
          | undefined;
        const practitioner = roleResource?.practitioner;
        if (practitioner?.reference?.startsWith('Practitioner/')) {
          practitionerReferences.push(practitioner);
        }
      }

      offset += pageSize;
    }

    const seen = new Set<string>();
    const uniquePractitioners = practitionerReferences.filter((practitioner) => {
      const key = practitioner.reference as string;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const validPractitioner = await Promise.all(
      uniquePractitioners.map(async (practitioner) => {
        const practitionerId = resolveId(practitioner);
        if (!practitionerId) return null;
        try {
          await this.source.read('Practitioner', practitionerId);
          return practitioner;
        } catch (e) {
          this.log.error('Cannot find practitioner', e);
          return null;
        }
      })
    );

    return validPractitioner.filter(
      (p): p is Reference<Practitioner> => Boolean(p)
    );
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
}
