import { Injectable } from '@nestjs/common';
import { FhirClient } from '../core/fhir-client';
import { UploadStatusConfig } from './upload-status.config';
import type { Bundle, Encounter, Media, DocumentReference } from '@medplum/fhirtypes';

@Injectable()
export class UploadStatusService {
  private readonly targetSystem: string;

  constructor(
    private readonly fhir: FhirClient,
    private readonly cfg: UploadStatusConfig,
  ) {
    this.targetSystem = cfg.updateStatus;
  }

  async fetchAllEncounters(): Promise<Encounter[]> {
    const all: Encounter[] = [];
    const pageSize = 200;
    let offset = 0;

    while (true) {
      const page = await this.fhir.search('Encounter', {
        _count: pageSize,
        _getpagesoffset: offset,
      }) as Bundle<Encounter>;

      const entries = (page.entry ?? []).map(e => e.resource).filter(Boolean) as Encounter[];
      if (entries.length === 0) break;

      all.push(...entries);
      if (entries.length < pageSize) break;
      offset += pageSize;
    }

    console.log(`upload-status: encounters=${all.length}`);
    return all;
  }

  private async fetchAllMedia(encId: string): Promise<Media[]> {
    const all: Media[] = [];
    const pageSize = 200;
    let offset = 0;

    while (true) {
      const page = await this.fhir.search('Media', {
        encounter: `Encounter/${encId}`,
        _count: pageSize,
        _getpagesoffset: offset,
      }) as Bundle<Media>;

      const entries = (page.entry ?? []).map(e => e.resource).filter(Boolean) as Media[];
      if (entries.length === 0) break;

      all.push(...entries);
      if (entries.length < pageSize) break;
      offset += pageSize;
    }

    console.log(`media: encounter=${encId} count=${all.length}`);
    return all;
  }

  private docRefIdFromUrl(url?: string | null): string | null {
    if (!url) return null;
    const m = url.match(/\/DocumentReference\/([A-Za-z0-9-]+)\b/);
    return m ? m[1] : null;
  }

  private async readDocRefById(id: string): Promise<DocumentReference | null> {
    const b = await this.fhir.search('DocumentReference', {
      _id: id,
      _count: 1,
      _elements: 'docStatus,content.attachment.contentType,content.attachment.size',
    }) as Bundle<DocumentReference>;

    const doc = (b.entry ?? []).map(e => e.resource).find(Boolean) ?? null;
    return doc ?? null;
  }

  private currentUploadStatus(enc: Encounter): string | null {
    const tags = enc.meta?.tag ?? [];
    const t = tags.find(x => x.system === this.targetSystem);
    return t?.code ?? null;
  }

  private buildSnapshotTags(existing: any[] | undefined, code: 'completed' | 'partial') {
    const kept = (Array.isArray(existing) ? existing : []).filter(t => !(t && t.system === this.targetSystem));
    kept.push({ system: this.targetSystem, code, display: code === 'completed' ? 'Completed' : 'Partial' });
    return kept;
  }

  async evaluateAndApply(encounters: Encounter[]): Promise<void> {
    for (const enc of encounters) {
      const encId = enc.id;
      if (!encId) continue;

      const medias = await this.fetchAllMedia(encId);
      if (medias.length === 0) {
        continue;
      }

      let anyDocMissing = false;
      let anyDocWithoutData = false;
      const checkedDocIds: string[] = [];

      for (const m of medias) {
        const docId = this.docRefIdFromUrl(m.content?.url ?? null);

        if (!docId) {
          anyDocMissing = true;
          continue;
        }

        const doc = await this.readDocRefById(docId);
        if (!doc) {
          anyDocMissing = true;
          continue;
        }

        checkedDocIds.push(doc.id as string);
        const parts = doc.content ?? [];
        const hasAnyData = parts.some(p => {
          const size = p?.attachment?.size;
          return typeof size === 'number' && size > 0;
        });

        if (!hasAnyData) {
          anyDocWithoutData = true;
        }
      }

      const desired: 'completed' | 'partial' = (anyDocMissing || anyDocWithoutData) ? 'partial' : 'completed';

      const fresh = await this.fhir.read('Encounter', encId) as Encounter;
      const current = this.currentUploadStatus(fresh) ?? 'none';

      console.log(
        `decision: encounter=${encId} set=${desired} current=${current} ` +
        `missingDoc=${anyDocMissing} docWithoutData=${anyDocWithoutData} ` +
        `docrefs=${checkedDocIds.join(',') || 'none'}`
      );

      if (!this.cfg.apply) {
        continue;
      }

      fresh.meta = fresh.meta ?? {};
      fresh.meta.tag = this.buildSnapshotTags(fresh.meta.tag, desired);

      // FhirClient.upsert -> PUT /{type}/{id}
      await this.fhir.upsert(
        {
          ...fresh,
          resourceType: 'Encounter',
          id: encId,
          meta: fresh.meta
        },
        {
          headers: { 'X-Meta-Snapshot-Mode': 'TAG' }
        }
      );
    }
  }
}
