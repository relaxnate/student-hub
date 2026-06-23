import { BaseRepository } from './BaseRepository'
import type { Module, ModuleItem, CompletionRequirement } from '@shared/types/entities'

// ─── Module Repository ───────────────────────────────────────────────────────

interface ModuleRow {
  id: string
  course_id: string
  external_id: string
  name: string
  position: number
  description: string | null
  unlock_at: number | null
  is_locked: number
  completed_requirements: number
  total_requirements: number
  synced_at: number
}

export class ModuleRepository extends BaseRepository<Module, ModuleRow> {
  protected get tableName() { return 'modules' }

  protected fromRow(row: ModuleRow): Module {
    return {
      id:                    row.id,
      courseId:              row.course_id,
      externalId:            row.external_id,
      name:                  row.name,
      position:              row.position,
      description:           row.description,
      unlockAt:              row.unlock_at,
      isLocked:              row.is_locked === 1,
      completedRequirements: row.completed_requirements,
      totalRequirements:     row.total_requirements,
      syncedAt:              row.synced_at,
    }
  }

  protected toRow(m: Partial<Module>): Partial<ModuleRow> {
    const row: Partial<ModuleRow> = {}
    if (m.id                    !== undefined) row.id                      = m.id
    if (m.courseId              !== undefined) row.course_id               = m.courseId
    if (m.externalId            !== undefined) row.external_id             = m.externalId
    if (m.name                  !== undefined) row.name                    = m.name
    if (m.position              !== undefined) row.position                = m.position
    if (m.description           !== undefined) row.description             = m.description
    if (m.unlockAt              !== undefined) row.unlock_at               = m.unlockAt
    if (m.isLocked              !== undefined) row.is_locked               = m.isLocked ? 1 : 0
    if (m.completedRequirements !== undefined) row.completed_requirements  = m.completedRequirements
    if (m.totalRequirements     !== undefined) row.total_requirements      = m.totalRequirements
    if (m.syncedAt              !== undefined) row.synced_at               = m.syncedAt
    return row
  }

  getByCourse(courseId: string): Module[] {
    const rows = this.db
      .prepare(`SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC`)
      .all(courseId) as ModuleRow[]
    return rows.map(r => this.fromRow(r))
  }

  save(module: Module): void   { this.upsert(module) }
  saveMany(modules: Module[]): void { this.upsertMany(modules) }
}

// ─── ModuleItem Repository ───────────────────────────────────────────────────

interface ModuleItemRow {
  id: string
  module_id: string
  course_id: string
  external_id: string
  title: string
  type: string
  position: number
  content_id: string | null
  url: string | null
  page_url: string | null
  completion_requirement: string | null  // JSON
  is_completed: number
  synced_at: number
}

export class ModuleItemRepository extends BaseRepository<ModuleItem, ModuleItemRow> {
  protected get tableName() { return 'module_items' }

  protected fromRow(row: ModuleItemRow): ModuleItem {
    let completionRequirement: CompletionRequirement | null = null
    if (row.completion_requirement) {
      try {
        completionRequirement = JSON.parse(row.completion_requirement) as CompletionRequirement
      } catch {
        // Malformed JSON from LMS — ignore gracefully
      }
    }

    return {
      id:                    row.id,
      moduleId:              row.module_id,
      courseId:              row.course_id,
      externalId:            row.external_id,
      title:                 row.title,
      type:                  row.type as ModuleItem['type'],
      position:              row.position,
      contentId:             row.content_id,
      url:                   row.url,
      pageUrl:               row.page_url,
      completionRequirement,
      isCompleted:           row.is_completed === 1,
      syncedAt:              row.synced_at,
    }
  }

  protected toRow(item: Partial<ModuleItem>): Partial<ModuleItemRow> {
    const row: Partial<ModuleItemRow> = {}
    if (item.id                    !== undefined) row.id                      = item.id
    if (item.moduleId              !== undefined) row.module_id               = item.moduleId
    if (item.courseId              !== undefined) row.course_id               = item.courseId
    if (item.externalId            !== undefined) row.external_id             = item.externalId
    if (item.title                 !== undefined) row.title                   = item.title
    if (item.type                  !== undefined) row.type                    = item.type
    if (item.position              !== undefined) row.position                = item.position
    if (item.contentId             !== undefined) row.content_id              = item.contentId
    if (item.url                   !== undefined) row.url                     = item.url
    if (item.pageUrl               !== undefined) row.page_url                = item.pageUrl
    if (item.completionRequirement !== undefined) {
      row.completion_requirement = item.completionRequirement
        ? JSON.stringify(item.completionRequirement)
        : null
    }
    if (item.isCompleted           !== undefined) row.is_completed            = item.isCompleted ? 1 : 0
    if (item.syncedAt              !== undefined) row.synced_at               = item.syncedAt
    return row
  }

  getByModule(moduleId: string): ModuleItem[] {
    const rows = this.db
      .prepare(`SELECT * FROM module_items WHERE module_id = ? ORDER BY position ASC`)
      .all(moduleId) as ModuleItemRow[]
    return rows.map(r => this.fromRow(r))
  }

  save(item: ModuleItem): void         { this.upsert(item) }
  saveMany(items: ModuleItem[]): void  { this.upsertMany(items) }
}
