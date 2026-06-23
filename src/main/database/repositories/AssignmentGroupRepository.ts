import { BaseRepository } from './BaseRepository'
import type { AssignmentGroup } from '@shared/types/entities'

interface AssignmentGroupRow {
  id: string
  course_id: string
  external_id: string
  name: string
  group_weight: number
  position: number
  synced_at: number
}

export class AssignmentGroupRepository extends BaseRepository<AssignmentGroup, AssignmentGroupRow> {
  protected get tableName() { return 'assignment_groups' }

  protected fromRow(row: AssignmentGroupRow): AssignmentGroup {
    return {
      id:          row.id,
      courseId:    row.course_id,
      externalId:  row.external_id,
      name:        row.name,
      groupWeight: row.group_weight,
      position:    row.position,
      syncedAt:    row.synced_at,
    }
  }

  protected toRow(g: Partial<AssignmentGroup>): Partial<AssignmentGroupRow> {
    const row: Partial<AssignmentGroupRow> = {}
    if (g.id          !== undefined) row.id           = g.id
    if (g.courseId    !== undefined) row.course_id    = g.courseId
    if (g.externalId  !== undefined) row.external_id  = g.externalId
    if (g.name        !== undefined) row.name         = g.name
    if (g.groupWeight !== undefined) row.group_weight = g.groupWeight
    if (g.position    !== undefined) row.position     = g.position
    if (g.syncedAt    !== undefined) row.synced_at    = g.syncedAt
    return row
  }

  getByCourse(courseId: string): AssignmentGroup[] {
    const rows = this.db
      .prepare(`SELECT * FROM assignment_groups WHERE course_id = ? ORDER BY position ASC`)
      .all(courseId) as AssignmentGroupRow[]
    return rows.map(r => this.fromRow(r))
  }

  save(group: AssignmentGroup): void           { this.upsert(group) }
  saveMany(groups: AssignmentGroup[]): void    { this.upsertMany(groups) }
}
