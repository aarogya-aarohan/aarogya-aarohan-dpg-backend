import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Bundle,
  Patient,
  Practitioner,
  QuestionnaireResponse as BaseQuestionnaireResponse,
  Resource,
} from '@medplum/fhirtypes';

interface QuestionnaireResponse extends BaseQuestionnaireResponse {
  mediaId?: string;
}
import * as Papa from 'papaparse';
import groupBy from 'lodash.groupby';
import { ConfigService } from '@nestjs/config';

import { FhirClient } from '../core/fhir-client';
import { ReaderGroupService } from './reader-group.service';
import { ReaderConfig } from './reader.config';

// Static suspicion & risk mapping for provisional diagnosis
const DIAGNOSIS_RESULTS_MAPPING: Record<
  string,
  { risk: string; isSuspicious: boolean }
> = {
  'oral cavity normal': { risk: 'Low', isSuspicious: false },
  benign: { risk: 'Low', isSuspicious: false },
  other: { risk: 'Low', isSuspicious: false },
  'smokeless tobacco keratosis': { risk: 'Low', isSuspicious: true },
  'homogenous oral leukoplakia': { risk: 'Low', isSuspicious: true },
  'oral lichen planus': { risk: 'Low', isSuspicious: true },
  'speckled oral leukoplakia': { risk: 'High', isSuspicious: true },
  erythroplakia: { risk: 'High', isSuspicious: true },
  'verrucous oral leukoplakia': { risk: 'High', isSuspicious: true },
  'proliferative verrucous oral leukoplakia': {
    risk: 'High',
    isSuspicious: true,
  },
  'squamous cell carcinoma of oral mucous membrane': {
    risk: 'High',
    isSuspicious: true,
  },
};

@Injectable()
export class ReaderAnalyticsService {
  private readonly limit = 1000;

  constructor(
    private readonly client: FhirClient,
    private readonly groups: ReaderGroupService,
    private readonly readerConfig: ReaderConfig,
    private readonly config: ConfigService
  ) {}

  async fetchReadersReport({
    startDate,
    endDate,
    groupId,
  }: {
    startDate: string;
    endDate: string;
    groupId: string;
  }) {
    const group = await this.groups.findGroup(groupId);
    if (!group) throw new BadRequestException('Invalid group ID');

    const readers = group.member
      .filter((m) => !m.inactive)
      .map((m) => m.entity.reference);
    const params = this.getSearchParams(startDate, endDate, readers);

    const { questionnaireResponses, patients } =
      await this.fetchAllQuestionnaireResponsesAndPatients(params);

    // Process and structure the data
    const structuredData = this.structureMediaPatientData(
      questionnaireResponses,
      patients
    );

    // Convert to CSV
    return this.convertToCsvFormatData(structuredData, readers);
  }

  /** Generate search parameters for the query */
  private getSearchParams(
    startDate: string,
    endDate: string,
    readers: string[]
  ) {
    return {
      questionnaire: this.readerConfig.imageLabellingQuestionnaireUrl,
      author: readers.join(','),
      authored: [
        `ge${new Date(startDate).toISOString().split('T')[0]}`,
        `le${new Date(endDate).toISOString().split('T')[0]}`,
      ],
    };
  }

  /** Fetch all QuestionnaireResponses including Patients with pagination */
  private async fetchAllQuestionnaireResponsesAndPatients(
    params: Record<string, any>
  ): Promise<{
    questionnaireResponses: QuestionnaireResponse[];
    patients: Patient[];
  }> {
    const allResponses: QuestionnaireResponse[] = [];
    const allPatients: Patient[] = [];
    let hasMore = true;
    let page = 1;

    const totalResponses = await this.client.search('QuestionnaireResponse', {
      ...params,
      _summary: 'count',
    });

    while (hasMore) {
      const pageOffset = (page - 1) * this.limit;
      const bundle: Bundle = await this.client.search('QuestionnaireResponse', {
        ...params,
        _include: [`QuestionnaireResponse:subject`],
        _count: this.limit,
        _getpagesoffset: pageOffset,
      });

      const patients = this.extractPatients(
        bundle.entry?.map((e) => e.resource)
      );
      allPatients.push(...patients);

      const resources: Resource[] = bundle.entry?.map((e) => e.resource) ?? [];
      const responses: QuestionnaireResponse[] = resources.filter(
        (r) => r.resourceType === 'QuestionnaireResponse'
      );

      responses.forEach((qr) => {
        const mediaItem = qr.item?.find((i) => i.linkId === 'media-id');
        if (mediaItem?.answer?.[0]?.valueString) {
          qr.mediaId = mediaItem.answer[0].valueString;
        }
      });

      allResponses.push(...responses);
      hasMore = allResponses.length < totalResponses.total;
      page++;
    }

    return { questionnaireResponses: allResponses, patients: allPatients };
  }

  /** Extract unique patient records from the fetched data */
  private extractPatients(resources: Resource[]): Patient[] {
    if (!resources?.length) return [];

    return Array.from(
      resources
        .filter((r) => r.resourceType === 'Patient') // Select only Patient resources
        .reduce((acc, patient) => {
          acc.set(patient.id, patient);
          return acc;
        }, new Map<string, Patient>()) // Ensure uniqueness
        .values()
    );
  }

  /** Structure data by media ID and patient */
  private structureMediaPatientData(
    questionnaireResponses: QuestionnaireResponse[],
    patients: Patient[]
  ) {

    const validMediaRefsByPatient = new Map<string, Set<string>>();

    patients.forEach((patient) => {
      const mediaRefs = new Set<string>();
      questionnaireResponses.forEach((qr) => {
        const patientId = qr.subject?.reference?.split('/')[1];
        if (patientId === patient.id && qr.mediaId) {
          mediaRefs.add(qr.mediaId);
        }
      });
      validMediaRefsByPatient.set(patient.id, mediaRefs);
    });

    const filteredResponses = questionnaireResponses.filter((qr) => {
      const patientId = qr.subject?.reference?.split('/')[1];
      const allowedMedia = validMediaRefsByPatient.get(patientId || '');
      const isValid = allowedMedia?.has(qr.mediaId ?? '');
      return isValid;
    });

    const groupedResponses = groupBy(filteredResponses, (item) => {
      const key = item.mediaId;
      return key;
    });

    console.log('Total unique media groups:', Object.keys(groupedResponses).length);

    const result = Object.entries(groupedResponses).map(([mediaId, responses]: [string, QuestionnaireResponse[]]) => {
      const uniquePatients = [...new Set(responses.map(qr => qr.subject?.reference?.split('/')[1]))];
      let patient: Patient | undefined = undefined;

      if (uniquePatients.length === 1) {
        patient = patients.find(p => p.id === uniquePatients[0]);
      } else {
        for (const pid of uniquePatients) {
          const mediaSet = validMediaRefsByPatient.get(pid);
          if (mediaSet?.has(mediaId)) {
            patient = patients.find(p => p.id === pid);
            break;
          }
        }
      }

      const entry = {
        media: {
          resourceType: mediaId.split('/')[0],
          id: mediaId.split('/')[1],
        },
        patient,
        questionnaireResponses: responses,
      };
      return entry;
    });

    return result;
  }

  private async convertToCsvFormatData(
    mediaWithPatientAndResponses: any,
    readers: string[]
  ) {
    const headers = [
      'Image ID',
      'Image Link',
      'Case ID',
      'Date of Recruitment',
      'Site',
      'R1 OCS',
      'R1 PD',
      'R1 Suspicion',
      'R1 Risk',
      'R1 replicate OCS',
      'R1 replicate PD',
      'R1 replicate Suspicion',
      'R1 replicate Risk',
      'R2 OCS',
      'R2 PD',
      'R2 Suspicion',
      'R2 Risk',
      'R2 replicate OCS',
      'R2 replicate PD',
      'R2 replicate Suspicion',
      'R2 replicate Risk',
    ];

    const baseUrl = this.config.get('FHIR_BASE_URL').replace('/fhir', '');

    const csvData = mediaWithPatientAndResponses.map((mpr: any) => [
      mpr.media.id,
      `${baseUrl}/dashboard/media/${mpr.media.id}`,
      mpr.patient?.id || 'N/A',
      this.getPatientRegistrationDate(mpr.patient),
      this.getPatientSite(mpr.patient),
      ...this.getDiagnosisByReaders(mpr.questionnaireResponses, readers),
    ]);

    return Papa.unparse({ fields: headers, data: csvData });
  }

  private getPatientRegistrationDate(patient: Practitioner) {
    return (
      patient?.extension?.find(
        (e) => e.url === this.readerConfig.patientRegistrationDateExtensionUrl
      )?.valueDateTime ?? 'N/A'
    );
  }

  private getPatientSite(patient: Practitioner) {
    return (
      patient?.meta?.tag?.find(
        (e) => e.system === this.readerConfig.patientSiteIdTagSystem
      )?.code ?? 'N/A'
    );
  }

  private getDiagnosisByReaders(qrs: QuestionnaireResponse[], readers: string[]) {
    const grouped = groupBy(qrs, 'author.reference');
    const [r1 = [], r2 = []] = readers.map((r) => grouped[r] || []);
    return [r1[0], r1[1], r2[0], r2[1]].map((qr) => {
      if (!qr) return [null, null, null, null];
      const pd = qr.item?.find((i) => i.linkId === 'provisional-diagnosis');
      const pdAnswer = pd?.answer?.[0]?.valueCoding?.display?.toLowerCase();
      const diagnosis = DIAGNOSIS_RESULTS_MAPPING[pdAnswer] || { risk: 'NA', isSuspicious: null };
      return [
        qr.item?.find((i) => i.linkId === 'oral-cavity-site')?.answer?.[0]
         ?.valueCoding?.display ?? 'N/A',
        pdAnswer ?? 'N/A',
        diagnosis.isSuspicious === true ? 'Suspicious' : diagnosis.isSuspicious === false ?  'Non-suspicious' : 'N/A',
        diagnosis.risk === 'NA' ? 'N/A' : diagnosis.risk + ' Risk',
      ];
    })
    .flat();
  }

  getMediaById(mediaId: string) {
    return this.client.read('Media', mediaId);
  }
}
