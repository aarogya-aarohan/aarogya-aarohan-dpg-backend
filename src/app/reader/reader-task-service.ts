import {
  Bundle,
  Encounter,
  Group,
  Media,
  Parameters,
  Practitioner,
  QuestionnaireResponse,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { DateTime } from 'luxon';
import { ReaderGroupService } from './reader-group.service';
import { Injectable, Logger } from '@nestjs/common';
import { FhirClient } from '../core/fhir-client';
import _ from 'lodash';
import { v3 } from 'uuid';
import { resolveId } from '@medplum/core';
import { ReaderConfig } from './reader.config';
import { throwOperationOutcome } from '../core/fhir-error';

@Injectable()
export class ReaderTaskService {
  private readonly log = new Logger('ReaderTaskCreator');

  constructor(
    private readonly groups: ReaderGroupService,
    private readonly source: FhirClient,
    private readonly config: ReaderConfig
  ) {}

  /**
   * Submit the reader task to be completed. If this is stage 1 task, a new
   * stage 2 task is also create for the future
   * @param parameters
   * @param practitioner
   */
  async submit(parameters: Parameters, practitioner: Practitioner) {
    // Extract the action "submit"
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
        return await this.submitLabel(task, parameters);
      default:
        throwOperationOutcome('error', 'code-invalid', 'Invalid action');
    }
  }

  /**
   * Submit the labelling task and mark it as done when successfully saved
   * @param task
   * @param parameters
   * @private
   */
  private async submitLabel(task: Task, parameters: Parameters) {
    // This is a task submission, we will look for response
    // Questionnaire Response
    const qr =
      (parameters.parameter.find(
        (p) =>
          p.name === 'questionnaire-response' &&
          p.resource?.resourceType === 'QuestionnaireResponse'
      )?.resource as QuestionnaireResponse) ??
      throwOperationOutcome(
        'error',
        'incomplete',
        'Missing QuestionnaireResponse'
      );

    // Extract the response from the questionnaire response
    const resource = await this.source.resourceOp(
      'QuestionnaireResponse',
      '$extract',
      parameters as unknown as Record<string, unknown>
    );

    // Find the stage
    const stageTag =
      task.meta.tag.find(
        (t) => t.system === this.config.taskStageTagReaderSystem
      ) ??
      throwOperationOutcome(
        'error',
        'code-invalid',
        'Task is not assigned to a stage'
      );

    // This is stage 1 task, we will need to create a stage 2 equivalent
    if (!stageTag.code) {
      throwOperationOutcome(
        'error',
        'code-invalid',
        'Task is assigned to a stage'
      );
    }

    // Mark the stage 1 task to be completed
    const now = DateTime.now();
    const nowISO = now.toISO();
    task.status = 'completed';
    task.lastModified = nowISO;
    // Attach the response of the questionnaire
    task.output = [
      ...(task.output ?? []),
      {
        id: 'task-questionnaire-response',
        valueReference: {
          reference: ['QuestionnaireResponse', qr.id].join('/'),
        },
        type: {
          coding: [
            {
              system: 'http://hl7.org/fhir/resource-types',
              code: 'QuestionnaireResponse',
              display: 'QuestionnaireResponse',
            },
          ],
        },
      },
    ];

    let stage2Task: Task | undefined;
    if (this.config.isTaskStage1(stageTag.code)) {
      const due = now.plus(this.config.durationBetweenTaskStage);
      stage2Task = this.createStage2Task(task, due);
    }

    // 4. Save the changes
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        // Generated resource for this task
        ...resource.entry,
        // Add the stage 2
        stage2Task
          ? {
              resource: stage2Task,
              request: {
                url: [stage2Task.resourceType, stage2Task.id].join('/'),
                method: 'PUT',
              },
            }
          : undefined,
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
      ].filter((e) => e),
    } as Bundle;
    await this.source.transaction(bundle);
  }

  async findReaderStats(practitioner: Reference<Practitioner>) {
    const filterDate = '2025-04-01';
    const today = DateTime.now().plus({ day: 1 }).toFormat('yyyy-MM-dd');
    const [total, completed, pending] = await Promise.all([
      this.source
        .search('Task', {
          owner: practitioner.reference,
          period: `lt${today}`, // Don't include future task in the stats
          _summary: 'count',
          'encounter.date': `lt${filterDate}`,
        })
        .then((b) => b.total),
      this.source
        .search('Task', {
          owner: practitioner.reference,
          period: `lt${today}`, // Don't include future task in the stats
          _summary: 'count',
          status: 'completed',
          'encounter.date': `lt${filterDate}`,
        })
        .then((b) => b.total),
      this.source
        .search('Task', {
          owner: practitioner.reference,
          period: `lt${today}`, // Don't include future task in the stats
          _summary: 'count',
          status: 'ready',
          'encounter.date': `lt${filterDate}`,
        })
        .then((b) => b.total),
    ]);
    return { total, completed, pending };
  }

  /**
   * Find the next task that can be take up by the reader. We will randomly
   * show the task for to reader everytime they request a new task
   * @param practitioner
   */

async findNextTask(practitioner: Reference<Practitioner>) {
    // Find out all the task for the given practitioner where it is ready
    // i.e. it has not be attempted
    // Added plus ensure that task created today is also picked up
  
    const filterDate = '2025-04-01';
    const today = DateTime.now().plus({ day: 1 }).toFormat('yyyy-MM-dd');

  
    const taskIds = await this.source
      .search('Task', {
        owner: practitioner.reference, // Assigned by self only
        status: 'ready', // Only not completed task
        period: `lt${today}`, // Show only in which the execution start period is in the past only
        'encounter.date': `lt${filterDate}`,
        _count: 1000, // We will load 1000 task, so that it can be evenly randomized
        _elements: 'id',
      })
      .then((b) => b.entry?.map((e) => e.resource.id) ?? []);

    // Shuffle the list of 1000 task id at once, at return the first item of the
    // shuffle
    // Fisher–Yates shuffle
    const taskId = _.shuffle(taskIds).slice(0, 1)?.[0];
    return taskId
      ? await this.source.search('Task', {
          _id: taskId,
          _include: [`Task:focus`, `Task:encounter`],
        })
      : ({
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [],
          total: 0,
        } as Bundle);
  }


  /**
   * Process all the encounter for which the task hasn't been generated for
   * the first stage
   * @param opt
   */
  async createStage1Tasks(opt?: { count?: number; chunked?: boolean }) {
    const { count, chunked } = opt ?? {};

    // Find out all the active groups. Ensure that we have a valid list of group
    // before we can start creating the reader task
    const allGroup = await this.findGroupForTask();
    if (allGroup.length === 0) {
      this.log.log('No groups to create task for ');
      return;
    }
    this.log.log('Active groups found', { count: allGroup.length });

    // Find out all the encounter that needs to be processed
    let encounterIds = await this.source
      .search('Encounter', {
        _elements: 'id',
        status: 'finished',
        '_tag:not': [
          this.config.encounterReaderSystem,
          this.config.encounterReaderCodeSuccess,
        ].join('|'),
      })
      .then((e) => e.entry?.map((e) => e.resource?.id) ?? []);
    encounterIds = _.shuffle(encounterIds);
    if (count) {
      encounterIds = encounterIds.slice(0, count);
    }

    // Perform parallel with a chunk of 10
    if (chunked) {
      for (const chunk of _.chunk(encounterIds, 10)) {
        await Promise.allSettled(
          chunk.map((id) => this.createWithStatus(id, allGroup))
        );
      }
      this.log.log(`Reader Task created for all`);
      return;
    }

    // Perform sequentially
    for (const id of encounterIds) {
      await this.createWithStatus(id, allGroup);
    }
    this.log.log(`Reader Task created for all`);
  }

  async createWithStatus(encounterId: string, allGroups: Group[]) {
    await this.create(encounterId, allGroups).catch(async (e) => {
      this.log.error('Error processing encounter', e, { id: encounterId });
    });
  }

  /**
   * Create the first stage task for each reader in the group for all images in
   * the given encounter. Each Media will be assigned to group of reader i.e
   * each reader in the group will see the own task for the given image
   * @param encounterId
   * @param allGroups
   */
  async create(encounterId: string, allGroups: Group[]) {
    // Fetch the encounter
    const encounter = await this.source.read('Encounter', encounterId);

    // Fetch all the images which are part of the encounter
    const media = await this.findMediaForTask(encounterId);
    if (media.length === 0) {
      this.log.log('No media to create task for ');
      return;
    }
    this.log.log('Media found', { count: media.length });

    // Create the reader task for all these media assigned to one group per media
    const tasks = media.flatMap((m) => this.buildTask(m, allGroups));

    // Mark the encounter as task has been generated for this, so that we will
    // not auto create stage 1 task
    this.attachStatusTag(encounter, this.config.encounterReaderCodeSuccess);

    // Prepare an update so all the above changes for this encounter can be
    // saved as a transaction
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [...tasks, encounter].map((r) => ({
        resource: r,
        request: { method: 'PUT', url: [r.resourceType, r.id].join('/') },
      })),
    } as Bundle;

    // Persist those changes
    await this.source.transaction(bundle);
    this.log.log('Reader task created', { encounterId, tasks: tasks.length });
  }

  private async findMediaForTask(encounterId: string) {
    const bundle = await this.source.search('Media', {
      encounter: ['Encounter', encounterId].join('/'),
    });

    return bundle.entry.map((r) => r.resource);
  }

  private async findGroupForTask() {
    // Find active groups
    const groupBundle = await this.groups.findGroups();
    const groups =
      groupBundle.entry
        ?.map((g) => g.resource)
        .filter((r) => r?.active)
        .map((r) => r as Group) ?? [];

    if (groups.length === 0) return groups;

    if (!groups.every((g) => g.identifier?.[0])) {
      throw new Error(
        'Some group has missing identifier. ' +
          'Please fix this to execute task creation'
      );
    }

    // TODO: All group should have at least 2 members
    if (!groups.every((g) => (g.member?.length ?? 0) >= 2)) {
      throw new Error('Ensure all group has at least two member. ');
    }

    return groups;
  }

  private findGroupForTheTask(groups: Group[]) {
    // TODO: Same shuffling algo
    const randomIndex = _.random(0, groups.length - 1, false);
    return groups[randomIndex];
  }

  /**
   * Create a task for each member of the group for a single media file
   * @param media
   * @param allGroup
   * @private
   */
  private buildTask(media: Media, allGroup: Group[]) {
    // Find the group to which the task can be assigned
    const group = this.findGroupForTheTask(allGroup);
    const groupIdentifier = group.identifier?.[0];
    this.log.log('Group identified to assigned', { group });

    const nowISO = DateTime.utc().toISO();
    return group.member
      .filter((m) => !m.inactive)
      .map((m) => {
        const id = v3(
          Buffer.from(media.id + resolveId(m.entity), 'utf-8').toString('hex'),
          v3.URL
        );

        return {
          id: `li-${id}`,
          resourceType: 'Task',
          meta: {
            tag: [
              {
                // Stage 1 task tag
                system: this.config.taskStageTagReaderSystem,
                code: this.config.taskTagReaderCodeStage1,
              },
            ],
          },
          instantiatesCanonical: this.config.instantiateCanonical,
          instantiatesUri: this.config.readerTaskUri,
          groupIdentifier: groupIdentifier, // Identifies the group assigned to the task
          status: 'ready',
          intent: 'order',
          priority: 'routine',
          focus: { reference: ['Media', media.id].join('/') },
          owner: m.entity, // Assign it the group member
          encounter: media.encounter,
          for: media.subject,
          restriction: { recipient: [m.entity] },
          code: {
            coding: [
              {
                system: 'http://hl7.org/fhir/CodeSystem/task-code',
                code: 'fulfill',
                display: 'Fulfill the focal request',
              },
            ],
          },
          description: 'Task for reader to label image',
          authoredOn: nowISO,
          lastModified: nowISO,
          executionPeriod: { start: nowISO },
          input: [
            {
              type: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/resource-types',
                    code: 'Questionnaire',
                    display: 'Questionnaire',
                  },
                ],
              },
              valueReference: {
                reference: this.config.questionnaire,
              },
            },
          ],
        } as Task;
      });
  }

  private attachStatusTag(encounter: Encounter, code: string) {
    encounter.meta.tag = [
      ...(encounter.meta.tag ?? []),
      { system: this.config.encounterReaderSystem, code },
    ];
  }

  private createStage2Task(stage1Task: Task, due: DateTime) {
    const start = due.toISO();
    const now = DateTime.utc().toISO();
    const id = v3(Buffer.from(stage1Task.id, 'utf-8').toString('hex'), v3.URL);
    return {
      ...stage1Task,
      id,
      meta: {
        tag: [
          {
            // Stage 2 task tag
            system: this.config.taskStageTagReaderSystem,
            code: this.config.taskTagReaderCodeStage2,
          },
        ],
      },
      authoredOn: now,
      lastModified: now,
      executionPeriod: { start },
      status: 'ready',
    } as Task;
  }
}
