import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { DataExportConfig } from './data-export-config';
import {
  Bundle,
  ClinicalImpression,
  Coding,
  Condition,
  Encounter,
  Media,
  Patient,
  Resource,
  RiskAssessment,
} from '@medplum/fhirtypes';
import { v3 } from 'uuid';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert';
import { FhirClient } from '../core/fhir-client';
import _ from 'lodash';

@Injectable()
export class DataExporter {
  private readonly log = new Logger(DataExporter.name);

  constructor(
    private readonly config: DataExportConfig,
    private readonly source: FhirClient,
    @Inject('EXPORT_FHIR_CLIENT') private readonly remote: FhirClient
  ) {
    assert(config.siteId, 'Missing siteId');
  }

  async processAll(opt?: { count?: number; chunked?: boolean }) {
    if (!this.config.enabled) throw new ForbiddenException('Export is disabled');
    const { count, chunked } = opt ?? {};
    this.log.debug('Export cases for all');

    let encounterIds = await this.source
      .search('Encounter', {
        // Very important, only finished encounter will be exported
        status: 'finished',
        _elements: 'id',
        _sort: '-date',
        _count: count,
        '_tag:not': [
          this.config.exportEncounterSystem,
          this.config.exportStatusCodeFinished,
        ].join('|'),
      })
      .then((e) => e.entry?.map((e) => e.resource?.id) ?? []);

    this.log.log(`Exporting encounters ${encounterIds.length}`);
    encounterIds = _.shuffle(encounterIds);
    if (count) encounterIds = encounterIds.slice(0, count);

    // Perform parallel with a chunk of 10
    if (chunked) {
      const chunks = _.chunk(encounterIds, 10);
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        await Promise.allSettled(c.map((id) => this.exportWithStatus(id)));
        this.log.log(`Chunk completed ${i + 1}`);
      }
      return;
    }

    // Perform sequentially
    for (let i = 0; i < encounterIds.length; i++) {
      const id = encounterIds[i];
      await this.exportWithStatus(id);
      this.log.log(`Encounter completed ${i + 1}`);
    }
    this.log.log(`Exported all encounter`);
  }

  private async exportWithStatus(encounterId: string) {
    await this.export(encounterId).catch(async (e) => {
      this.log.error('Error processing encounter', e, { encounterId });
      await this.updateStatus(
        encounterId,
        this.config.exportStatusCodeFailed
      ).catch();
    });
  }

  async export(encounterId: string) {
    if (!this.config.enabled) throw new ForbiddenException('Export is disabled');
    // Load the data
    const everything = await this.source.instanceOp(
      'Encounter',
      encounterId,
      '$everything',
      undefined,
      { _count: 100 }
    );

    // Prepare the data to be sent
    const { resources, docIds } = this.prepare(everything);

    // Send the data
    const missingDocIds = await this.pushDocs(docIds);
    const relevantResources = this.removeMissingMedia(resources, missingDocIds);
    await this.pushResources(relevantResources);
    await this.updateStatus(encounterId, this.config.exportStatusCodeFinished);
  }

  private removeMissingMedia(resources: Resource[], missingDocIds: string[]) {
    return resources.filter((r) => {
      // If it is not a media file, we won't exclude it
      if (r.resourceType === 'Media') {
        const tags = r.meta?.tag;
        // If it doesn't have tag, allow it
        if (!tags) return true;

        // If the tag exist and the document is same as one of the missing
        // document, we will exclude the media
        return !tags.some((t) => t.code && missingDocIds.includes(t.code));
      }
      return true;
    });
  }

  private async updateStatus(encounterId: string, code: string) {
    const encounter = await this.source.read('Encounter', encounterId);

    // Mark the encounter as export and update it so that we won't try to
    // export it again
    const tags = (encounter.meta.tag ?? []).filter(
      (t) => t.system !== this.config.exportEncounterSystem
    );
    encounter.meta.tag = [
      ...tags,
      { system: this.config.exportEncounterSystem, code },
    ];
    await this.source.upsert(encounter);
    this.log.log('Updated encounter export status');
  }

  /**
   * Push all the document that are uploaded. If any document is missing
   * in that case, we will ignore it
   * @param docIds
   * @return List of all document if it has not been uploaded
   * @private
   */
  private async pushDocs(docIds: string[]) {
    const missing = [] as string[];
    for (const docId of docIds) {
      try {
        const doc = await this.source.read('DocumentReference', docId);
        if (doc.content?.[0]?.attachment?.data) {
          doc.meta = {};
          this.attachSiteTag([doc]);
          await this.remote.upsert(doc);
          this.log.log('Document uploaded', { docId });
        } else {
          missing.push(docId);
          console.warn(`Document ${docId} has missing data`);
        }
      } catch (e) {
        console.error(e);
        throw new Error('Failed to push docs');
      }
    }
    return missing;
  }

  private async pushResources(resource: Resource[]) {
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: resource.map((r) => ({
        resource: r,
        request: { method: 'PUT', url: [r.resourceType, r.id].join('/') },
      })),
    } as Bundle;
    await this.remote.transaction(bundle);
  }

  private prepare(everything: Bundle) {
    const patient = this.preparePatient(everything);
    const encounter = this.prepareEncounter(everything, patient);
    const locations = this.prepareLocations(everything, encounter);
    const observations = this.prepareObservation(
      everything,
      patient,
      encounter
    );
    const { media, docIds } = this.prepareMedia(everything, patient, encounter);
    const diagnosisResources = this.preparePostDiagnosis(
      everything,
      patient,
      encounter
    );

    const resources = [
      patient,
      encounter,
      ...locations,
      ...observations,
      ...media,
      ...diagnosisResources,
    ];
    this.attachSiteTag(resources);

    return { resources, docIds };
  }

  private attachSiteTag(resources: Resource[]) {
    // Tag all the resource with the site id
    const siteTag = {
      code: this.config.siteId,
      system: this.config.exportSiteSystemId,
      display: 'Site Id',
    } as Coding;

    // Attach Site tag to all resource
    resources.forEach((r) => {
      if (!r.meta) r.meta = {};
      if (!r.meta.tag) r.meta.tag = [];
      r.meta.tag.push(siteTag);
    });
  }

  private preparePatient(everything: Bundle) {
    const patient = everything.entry
      .map((e) => e.resource)
      .find((r) => r.resourceType === 'Patient') as Patient;
    if (!patient) {
      throw new Error('No patient found for this resource');
    }
    const newId = v3(Buffer.from(patient.id, 'utf-8').toString('hex'), v3.URL);

    return {
      resourceType: 'Patient',
      id: newId,
      extension: patient.extension, // Date of registration
      birthDate: patient.birthDate, //
      gender: patient.gender,
    } as Patient;
  }

  private prepareEncounter(everything: Bundle, patient: Patient) {
    const patientRef = this.asReference(patient);

    // Find the encounter
    const encounter = everything.entry
      .map((e) => e.resource)
      .find((r) => r.resourceType === 'Encounter');
    if (!encounter) {
      throw new Error('No encounter found for this resource');
    }
    const newEncounterId = v3(
      Buffer.from(encounter.id, 'utf-8').toString('hex'),
      v3.URL
    );

    return {
      resourceType: 'Encounter',
      id: newEncounterId,
      period: encounter.period,
      subject: { reference: patientRef },
      diagnosis: [],
      location: encounter.location,
      status: encounter.status,
    } as Encounter;
  }

  private prepareObservation(
    everything: Bundle,
    patient: Patient,
    encounter: Encounter
  ) {
    const patientRef = this.asReference(patient);
    const encounterRef = this.asReference(encounter);

    const observations = everything.entry
      .map((e) => e.resource)
      .filter((r) => r.resourceType === 'Observation');

    observations.forEach((o) => {
      o.meta = {};
      o.id = randomUUID();
      o.subject = { reference: patientRef };
      o.encounter = { reference: encounterRef };
      const coding = o.valueCodeableConcept?.coding?.[0];
      if (coding) {
        o.valueCodeableConcept = {
          coding: [
            {
              system: coding.system,
              code: coding.code,
              display: coding.display,
            },
          ],
        };
      }
    });
    return observations;
  }

  private asReference(resource: Resource) {
    return [resource.resourceType, resource.id].join('/');
  }

  private extractId(url?: string) {
    if (!url) return null;

    const parts = url.split('DocumentReference/');
    if (parts.length < 2) return null;
    const idPart = parts[1].split('/');
    if (idPart.length == 0) return null;
    return idPart[0];
  }

  private prepareLocations(everything: Bundle, encounter: Encounter) {
    const locationIds =
      encounter.location
        ?.map((entry) => entry.location?.reference)
        ?.map((ref) => ref?.split('/')?.[1])
        ?.filter((id) => id)
        ?.map((id) => id as string) ?? [];

    return everything.entry
      .map((e) => e.resource)
      .filter((r) => r?.resourceType === 'Location')
      .filter((l) => locationIds.includes(l.id));
  }

  private preparePostDiagnosis(
    everything: Bundle,
    patient: Patient,
    encounter: Encounter
  ) {
    const patientRef = this.asReference(patient);
    const encounterRef = this.asReference(encounter);

    // Map the condition
    const condition = everything.entry
      .map((e) => e.resource)
      .find((r) => r.resourceType === 'Condition');

    const c = condition
      ? ({
          resourceType: 'Condition',
          id: randomUUID(),
          clinicalStatus: condition.clinicalStatus,
          verificationStatus: condition.verificationStatus,
          code: condition.code,
          bodySite: condition.bodySite,
          subject: { reference: patientRef },
          encounter: { reference: encounterRef },
        } as Condition)
      : undefined;

    // Map the risk assessment
    const riskAssessment = everything.entry
      .map((e) => e.resource)
      .find((r) => r.resourceType === 'RiskAssessment');

    const r = riskAssessment
      ? ({
          resourceType: 'RiskAssessment',
          id: randomUUID(),
          status: 'final',
          subject: { reference: patientRef },
          encounter: { reference: encounterRef },
          condition: c ? this.asReference(c) : undefined,
          prediction: riskAssessment.prediction,
        } as RiskAssessment)
      : undefined;

    // Map the impression
    const impressions = everything.entry
      .map((e) => e.resource)
      .find((r) => r.resourceType === 'ClinicalImpression');

    const i = impressions
      ? ({
          resourceType: 'ClinicalImpression',
          id: randomUUID(),
          status: 'completed',
          date: impressions.date,
          subject: { reference: patientRef },
          encounter: { reference: encounterRef },
          description: impressions.description,
          problem: c ? [{ reference: this.asReference(c) }] : [],
          finding: impressions.finding,
          prognosisReference: r ? [{ reference: this.asReference(r) }] : [],
        } satisfies ClinicalImpression)
      : undefined;

    return [i, c, r].filter((r) => r);
  }

  private prepareMedia(
    everything: Bundle,
    patient: Patient,
    encounter: Encounter
  ) {
    const media = everything.entry
      .map((e) => e.resource)
      .filter((r) => r.resourceType === 'Media')
      .map((r) => r as Media);

    const patientRef = this.asReference(patient);
    const encounterRef = this.asReference(encounter);

    const baseUrl = this.config.fhirUrl;
    const docIds = [] as string[];
    const m = media
      .map((m) => [m, this.extractId(m.content?.url)])
      .filter((m) => m[1])
      .map((p) => {
        const m = p[0] as Media;
        const docId = p[1] as string;
        docIds.push(docId);

        const url = `${baseUrl}/DocumentReference/${docId}/$binary-access-read?path=DocumentReference.content.attachment`;
        return {
          resourceType: 'Media',
          id: randomUUID(),
          meta: {
            tag: [
              {
                code: docId,
                system: 'http://midas.iisc.ac.in/media-doc-id',
              },
            ],
          },
          status: 'completed',
          type: m.type,
          view: m.view,
          subject: { reference: patientRef },
          encounter: { reference: encounterRef },
          createdDateTime: m.createdDateTime,
          bodySite: m.bodySite,
          content: {
            url,
            contentType: m.content.contentType,
            creation: m.content.creation,
          },
        } as Media;
      });

    return { media: m, docIds };
  }
}
