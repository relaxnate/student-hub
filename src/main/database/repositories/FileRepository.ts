import { BaseRepository } from './BaseRepository'
import type { CourseFile } from '@shared/types/entities'

interface FileRow {
  id: string
  course_id: string
  external_id: string
  filename: string
  display_name: string
  content_type: string
  size: number
  url: string | null
  local_path: string | null
  folder_path: string
  is_hidden: number
  is_locked: number
  created_at: number | null
  updated_at: number | null
  synced_at: number
}

export class FileRepository extends BaseRepository<CourseFile, FileRow> {
  protected get tableName() { return 'files' }

  protected fromRow(row: FileRow): CourseFile {
    return {
      id:          row.id,
      courseId:    row.course_id,
      externalId:  row.external_id,
      filename:    row.filename,
      displayName: row.display_name,
      contentType: row.content_type,
      size:        row.size,
      url:         row.url,
      localPath:   row.local_path,
      folderPath:  row.folder_path,
      isHidden:    row.is_hidden === 1,
      isLocked:    row.is_locked === 1,
      createdAt:   row.created_at,
      updatedAt:   row.updated_at,
      syncedAt:    row.synced_at,
    }
  }

  protected toRow(f: Partial<CourseFile>): Partial<FileRow> {
    const row: Partial<FileRow> = {}
    if (f.id          !== undefined) row.id           = f.id
    if (f.courseId    !== undefined) row.course_id    = f.courseId
    if (f.externalId  !== undefined) row.external_id  = f.externalId
    if (f.filename    !== undefined) row.filename     = f.filename
    if (f.displayName !== undefined) row.display_name = f.displayName
    if (f.contentType !== undefined) row.content_type = f.contentType
    if (f.size        !== undefined) row.size         = f.size
    if (f.url         !== undefined) row.url          = f.url
    if (f.localPath   !== undefined) row.local_path   = f.localPath
    if (f.folderPath  !== undefined) row.folder_path  = f.folderPath
    if (f.isHidden    !== undefined) row.is_hidden    = f.isHidden ? 1 : 0
    if (f.isLocked    !== undefined) row.is_locked    = f.isLocked ? 1 : 0
    if (f.createdAt   !== undefined) row.created_at   = f.createdAt
    if (f.updatedAt   !== undefined) row.updated_at   = f.updatedAt
    if (f.syncedAt    !== undefined) row.synced_at    = f.syncedAt
    return row
  }

  getByCourse(courseId: string): CourseFile[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM files
        WHERE course_id = ? AND is_hidden = 0
        ORDER BY folder_path ASC, display_name ASC
      `)
      .all(courseId) as FileRow[]
    return rows.map(r => this.fromRow(r))
  }

  save(file: CourseFile): void          { this.upsert(file) }
  saveMany(files: CourseFile[]): void   { this.upsertMany(files) }
}
