import { resolveId } from '@medplum/core';
import { Injectable, Logger } from '@nestjs/common';
import {
  Bundle,
  Extension,
  Practitioner,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import _ from 'lodash';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { FhirClient } from '../../../core/fhir-client';
import { DiagnosisConfig } from '../../diagnosis-config';
import { DiagnosisSharedService } from '../../diagnosis-shared.service';

@Injectable()
export class SpecialistTaskService {
  private readonly log = new Logger(SpecialistTaskService.name);

  constructor(
    private readonly source: FhirClient,
    private readonly shared: DiagnosisSharedService,
    private readonly config: DiagnosisConfig
  ) {}

  async process() {
    await this.processAll();
  }

  async processAll() {
    this.log.log('Process specialist diagnosis completed tasks');

    const assignee = await this.shared.findSpecialist('tele-specialist');
    if (!assignee) {
      this.log.log('Cannot find specialist assignee');
      return;
    }

    const dentistRefs = await this.shared.findSpecialists('dentist');
    const dentistIds = this.toPractitionerIds(dentistRefs);
    if (dentistIds.length === 0) {
      this.log.log('No active dentist found');
      return;
    }

    const completedDentistTasks = await this.loadTasksByOwnerIds(dentistIds, {
      status: 'completed',
    });
    const dentistTasks = this.uniqueTasksById(completedDentistTasks);
    this.log.debug(`Completed dentist tasks found ${dentistTasks.length}`);
    if (dentistTasks.length === 0) {
      this.log.log('No completed dentist tasks found');
      return;
    }

    const candidates = dentistTasks.filter(
      (task) => task.id && !this.hasSpecialistMarker(task)
    );
    const selectedTasks = _.shuffle(candidates).slice(
      0,
      this.config.specialistTaskLimit
    );

    console.log('Specialist task selection summary', {
      dentists: dentistIds.length,
      completedDentistTasks: dentistTasks.length,
      alreadyMarkedByDentistExtension: dentistTasks.length - candidates.length,
      selectedCount: selectedTasks.length,
      selectedTaskIds: selectedTasks.map((task) => task.id),
      configuredLimit: this.config.specialistTaskLimit,
    });

    for (const chunk of _.chunk(selectedTasks, 10)) {
      const taskPairs = chunk
        .map((task) => this.prepareTaskPair(task, assignee))
        .filter(
          (
            taskPair
          ): taskPair is { specialistTask: Task; dentistTaskUpdate: Task } =>
            Boolean(taskPair)
        );

      if (taskPairs.length === 0) continue;

      await this.pushTasks(taskPairs);
    }
  }

  private prepareTaskPair(sourceTask: Task, assignee: Reference<Practitioner>) {
    const specialistTask = this.prepareSpecialistReviewTask(sourceTask, assignee);
    if (!specialistTask?.id) return null;

    const dentistTaskUpdate = this.prepareDentistTaskMarkerUpdate(
      sourceTask,
      specialistTask.id
    );
    if (!dentistTaskUpdate) return null;

    return {
      specialistTask,
      dentistTaskUpdate,
    };
  }

  private prepareSpecialistReviewTask(
    sourceTask: Task,
    assignee: Reference<Practitioner>
  ) {
    if (!sourceTask.id) return null;

    return {
      ...sourceTask,
      id: randomUUID(),
      meta: undefined,
      owner: assignee,
      status: 'requested',
      description: "Task for specialist to review patient diagnosis",
      focus: this.config.specialistReviewQuestionnaire,
      instantiatesCanonical: this.config.specialistReviewInstantiateCanonical,
      lastModified: DateTime.now().toISO(),
    } as Task;
  }

  private prepareDentistTaskMarkerUpdate(
    sourceTask: Task,
    specialistTaskId: string
  ) {
    if (!sourceTask.id) return null;
    if (this.hasSpecialistMarker(sourceTask)) return null;

    const markerExtension = {
      url: this.config.specialistSourceTaskIdExtensionUrl,
      valueString: specialistTaskId,
    } satisfies Extension;

    return {
      ...sourceTask,
      meta: undefined,
      lastModified: DateTime.now().toISO(),
      extension: [...(sourceTask.extension ?? []), markerExtension],
    } as Task;
  }

  private async pushTasks(
    taskPairs: { specialistTask: Task; dentistTaskUpdate: Task }[]
  ) {
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: taskPairs.flatMap(({ specialistTask, dentistTaskUpdate }) => [
        {
          resource: specialistTask,
          request: {
            url: [specialistTask.resourceType, specialistTask.id].join('/'),
            method: 'PUT',
          },
        },
        {
          resource: dentistTaskUpdate,
          request: {
            url: [dentistTaskUpdate.resourceType, dentistTaskUpdate.id].join('/'),
            method: 'PUT',
          },
        },
      ]),
    } as Bundle<Task>;
    await this.source.transaction(bundle);
  }

  private async loadTasksByOwnerIds(
    ownerIds: string[],
    opt?: { status?: string }
  ) {
    const allTasks: Task[] = [];
    const pageSize = 200;

    for (const ownerChunk of _.chunk(ownerIds, 20)) {
      let offset = 0;

      while (true) {
        const bundle = await this.source.search('Task', {
          owner: ownerChunk.join(','),
          ...(opt?.status ? { status: opt.status } : {}),
          _count: pageSize,
          _getpagesoffset: offset,
        }) as Bundle<Task>;

        const tasks = (bundle?.entry ?? [])
          .map((entry) => entry.resource as Task | undefined)
          .filter((task): task is Task => Boolean(task));

        allTasks.push(...tasks);
        if (tasks.length === 0 || tasks.length < pageSize) break;

        offset += pageSize;
      }
    }

    return allTasks;
  }

  private hasSpecialistMarker(task: Task) {
    return Boolean(
      task.extension?.some(
        (ext) => ext.url === this.config.specialistSourceTaskIdExtensionUrl
      )
    );
  }

  private uniqueTasksById(tasks: Task[]) {
    const unique = new Map<string, Task>();
    for (const task of tasks) {
      if (!task.id) continue;
      if (!unique.has(task.id)) {
        unique.set(task.id, task);
      }
    }
    return Array.from(unique.values());
  }

  private toPractitionerIds(practitionerRefs: Reference<Practitioner>[]) {
    const ids = new Set<string>();

    for (const practitionerRef of practitionerRefs) {
      const id = resolveId(practitionerRef);
      if (id) ids.add(id);
    }

    return Array.from(ids);
  }
}
