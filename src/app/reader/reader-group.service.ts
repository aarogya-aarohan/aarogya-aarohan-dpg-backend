import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { Group, GroupMember } from '@medplum/fhirtypes';
import { CreateReaderGroupDto } from './dto/reader-group.dto';
import { FhirClient } from '../core/fhir-client';

@Injectable()
export class ReaderGroupService {
  readonly identifierSystem = 'http://midas.iisc.ac.in/reader-group-code';
  readonly typeSystem = 'http://midas.iisc.ac.in/group-type';
  readonly typeValue = 'reader_group';

  constructor(private readonly client: FhirClient) {}

  async create(payload: CreateReaderGroupDto) {
    const { code, members, name } = payload;

    // Verify group is missing
    const identifier = [this.identifierSystem, code].join('|');
    const existingGroup = await this.client.search('Group', { identifier });
    if (existingGroup.total) {
      throw new HttpException('Group already exists', HttpStatus.BAD_REQUEST);
    }

    // Verify all the member of the group are unassigned
    for (const member of members) {
      const memberGroup = await this.client.search('Group', {
        member: ['Practitioner', member].join('/'),
        code: [this.typeSystem, this.typeValue].join('|'),
      });
      if (memberGroup.total > 0) {
        throw new HttpException(
          `${member} already part of a group`,
          HttpStatus.BAD_REQUEST
        );
      }
    }

    // Create the group
    const now = DateTime.now().toISO();
    const group = {
      resourceType: 'Group',
      id: randomUUID(),
      identifier: [{ system: this.identifierSystem, value: code }],
      active: true,
      type: 'practitioner',
      actual: true,
      code: {
        text: 'Reader Group',
        coding: [{ code: this.typeValue, system: this.typeSystem }],
      },
      name,
      quantity: members.length,
      member: members.map(
        (m) =>
          ({
            entity: {
              type: 'Practitioner',
              reference: ['Practitioner', m].join('/'),
            },
            period: { start: now },
            inactive: false,
          } satisfies GroupMember)
      ),
    } satisfies Group;

    return this.client.upsert(group);
  }

  async findGroups() {
    return await this.client.search('Group', {
      code: [this.typeSystem, this.typeValue].join('|'),
    });
  }

  async findGroup(groupId: string) {
    return await this.client.read('Group', groupId);
  }
}
