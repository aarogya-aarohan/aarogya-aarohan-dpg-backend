import { Injectable, Logger } from '@nestjs/common';
import {
  Bundle,
  Task,
} from '@medplum/fhirtypes';
import _ from 'lodash';
import { FhirClient } from '../../../../core/fhir-client';
import { DiagnosisConfig } from '../../../diagnosis-config';
import { DiagnosisSharedService } from '../../../diagnosis-shared.service';

const NON_SUSP_PERCENT = Number(process.env.DIAGNOSIS_NON_SUSP_PERCENT);

@Injectable()
export class NonSuspiciousTaskService {
  private readonly log = new Logger(NonSuspiciousTaskService.name);

  constructor(
    private readonly source: FhirClient,
    private readonly shared: DiagnosisSharedService,
    private readonly config: DiagnosisConfig
  ) {}

  async process() {
    await this.processAll();
  }

  async processAll() {
    this.log.log('Process non-suspicious diagnosis tasks');

    const pendingNonSuspIds = await this.getPendingNonSuspiciousEncounterIds();
    const eligibleNonSuspIds = await this.getEligibleNonSuspiciousEncounterIds(pendingNonSuspIds);
    const totalEligibleNonSusp = eligibleNonSuspIds.length;
    const quota = totalEligibleNonSusp > 0 ? Math.ceil((totalEligibleNonSusp * NON_SUSP_PERCENT) / 100) : 0;
    const selectedEncounterIds = _.shuffle(eligibleNonSuspIds).slice(0, quota);
   console.log('Non-suspicious selection summary', {
      percent: NON_SUSP_PERCENT,
      totalPending: pendingNonSuspIds.length,
      totalEligible: totalEligibleNonSusp,
      quota,
      selectedCount: selectedEncounterIds.length,
      selectedEncounterIds: selectedEncounterIds.join(','),
      EligibleList: eligibleNonSuspIds.join(','),
    });

    for (const chunk of _.chunk(selectedEncounterIds, 10)) {
      await Promise.allSettled(chunk.map((id) => this.create(id)));
    }
  }

  private async getEligibleNonSuspiciousEncounterIds(encounterIds: string[]) {
    const eligible: string[] = [];

    for (const chunk of _.chunk(encounterIds, 10)) {
      const results = await Promise.allSettled(
        chunk.map((id) => this.isEncounterEligibleForTask(id))
      );

      for (let i = 0; i < chunk.length; i++) {
        const id = chunk[i];
        const result = results[i];
        if (result.status === 'fulfilled' && result.value) {
          eligible.push(id);
        }
      }
    }

    return eligible;
  }

  private async isEncounterEligibleForTask(encounterId: string): Promise<boolean> {
    try {
      const { everything } = await this.shared.loadInitialData(encounterId);
      if (this.shared.hasTaskAlreadyGenerated(everything)) {
        return false;
      }

      const { documentIds, allDocIdValid } = this.shared.isAllDocumentValid(everything);
      if (!allDocIdValid) {
        return false;
      }

      return await this.shared.isDocumentUploaded(documentIds);
    } catch {
      return false;
    }
  }

  private async create(encounterId: string) {
    this.log.log('Create Non-Suspicious Diagnosis task', { encounterId });
    const { everything, encounter } = await this.shared.loadInitialData(encounterId);

    if (this.shared.hasTaskAlreadyGenerated(everything)) {
      this.log.log('Task already generated for the encounter', { encounterId });
      return;
    }

    const { documentIds, allDocIdValid } = this.shared.isAllDocumentValid(everything);
    if (!allDocIdValid) {
      this.log.error(
        'All document id not found/invalid. This should not happen',
        { encounterId }
      );
      return;
    }

    const docsUploaded = await this.shared.isDocumentUploaded(documentIds);
    if (!docsUploaded) {
      return;
    }

    const assignee = await this.shared.findSpecialist('dentist');
    if (!assignee) {
      this.log.log('Cannot find specialist to assign');
      return;
    }

    console.log('Assigning non-suspicious encounter to dentist', { encounterId, dentist: assignee.reference });
    const resources = this.shared.prepareDiagnosisResources(encounter, assignee, this.config.dentistQuestionnaire, this.config.dentistInstantiateCanonical);
    await this.shared.pushResource(resources, encounterId, this.config.dentistInstantiateCanonical);
    console.log('Encounter processed for non-suspicious patient care', { encounterId });
  }

  private async getPendingNonSuspiciousEncounterIds(): Promise<string[]> {
    const encounterIds = await this.getRecentNonSuspiciousEncounterIds();
    if (encounterIds.length === 0) return [];

    const pending: string[] = [];
    for (const chunk of _.chunk(_.uniq(encounterIds), 10)) {
      const results = await Promise.allSettled(chunk.map((id) => this.hasAnyTaskForEncounter(id)));
      for (let i = 0; i < chunk.length; i++) {
        const id = chunk[i];
        const r = results[i];
        if (r.status === 'fulfilled' && !r.value) {
          pending.push(id);
        }
      }
    }

    return pending;
  }

  private async getRecentNonSuspiciousEncounterIds(): Promise<string[]> {
    const encounterIdSet = new Set<string>();
    const pageSize = 200;
    let offset = 0;
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(
      Date.now() - this.config.nonSuspiciousMinEncounterAgeMs
    ).toISOString();

    console.log('Searching recent non-suspicious encounters', {
      cutoffIso,
      nowIso
    });

    while (true) {
      const searchParams = {
        status: 'planned,arrived,triaged',
        'oc-overall': this.config.nonSuspiciousOcValue,
        date: [`ge${cutoffIso}`, `le${nowIso}`],
        _elements: 'id',
        _count: pageSize,
        _getpagesoffset: offset,
      };

      console.log('Sending Encounter search for non-suspicious diagnosis', {
        offset,
        query: searchParams,
      });

      const bundle = await this.source.search('Encounter', searchParams) as Bundle;

      const entries = bundle?.entry ?? [];
      if (entries.length === 0) break;

      for (const entry of entries) {
        const id = entry.resource?.id;
        if (id) encounterIdSet.add(id);
      }

      offset += pageSize;
    }

    return Array.from(encounterIdSet);
  }

  private async hasAnyTaskForEncounter(encounterId: string): Promise<boolean> {
    const bundle = await this.source.search('Task', {
      encounter: `Encounter/${encounterId}`,
      _summary: 'count',
      _count: 0,
    }) as Bundle<Task>;
    return (bundle?.total ?? 0) > 0;
  }
}
