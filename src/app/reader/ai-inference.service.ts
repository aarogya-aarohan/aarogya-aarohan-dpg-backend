import { BadRequestException, Injectable } from '@nestjs/common';
import { FhirClient } from '../core/fhir-client';
import { ReaderConfig } from './reader.config';
import { Inference } from './dto/inference.dto';
import { Bundle, Extension, Media } from '@medplum/fhirtypes';

@Injectable()
export class AiInferenceService {
  constructor(
    private readonly source: FhirClient,
    private readonly config: ReaderConfig
  ) {}

  public getPendingImageForInference() {
    return this.source.search('Media', {
      '_tag:not': [
        this.config.aiInferenceTagSystem,
        this.config.aiInferenceTagFinished,
      ].join('|'),
      _count: 100,
      // Body
      site: ['http://www.snomed.org', '113277000'].join('|'),
      'encounter.status': 'finished',
    });
  }

  public async submitInferenceResult(inference: Inference[]) {
    const inferenceByKey = inference.reduce(
      (acc, v) => ({ ...acc, [v.mediaId]: v }),
      {} as Record<string, Inference>
    );
    const media = await this.source
      .search('Media', {
        _id: Object.keys(inferenceByKey).join(','),
        '_tag:not': [
          this.config.aiInferenceTagSystem,
          this.config.aiInferenceTagFinished,
        ].join('|'),
      })
      .then((b) => b.entry?.map((e) => e.resource) ?? []);

    if (media.length === 0) return;

    const inferenceMedia = media.map((m) => {
      const hasInference =
        m.extension?.some(
          (e) => e.url === this.config.inferenceConfidenceExtensionUrl
        ) ?? false;

      if (hasInference) {
        throw new BadRequestException(`Media ${m.id} already inference`);
      }

      const inference = inferenceByKey[m.id];

      // Add extension by noting the confidence
      const confidenceExt = {
        url: this.config.inferenceConfidenceExtensionUrl,
        valueDecimal: inference.confidence,
      } as Extension;

      // Add extension for noting the class
      const classExt = {
        url: this.config.inferenceClassExtensionUrl,
        valueCode: inference.class,
      } as Extension;
      m.extension = [...(m.extension ?? []), confidenceExt, classExt];

      // Tag it to mark it as done
      m.meta = {
        ...(m.meta ?? {}),
        tag: [
          ...(m.meta?.tag ?? []),
          {
            system: this.config.aiInferenceTagSystem,
            code: this.config.aiInferenceTagFinished,
          },
        ],
      };
      return m;
    });

    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: inferenceMedia.map((m) => ({
        resource: m,
        request: { method: 'PUT', url: `Media/${m.id}` },
      })),
    } as Bundle<Media>;

    await this.source.transaction(bundle);
  }
}
