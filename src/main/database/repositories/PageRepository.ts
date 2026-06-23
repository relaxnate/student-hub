import { BaseRepository } from './BaseRepository'
import type { CoursePage } from '@shared/types/entities'

interface PageRow {
  id: string
  course_id: string
  external_id: string
  title: string
  body_html: string | null
  url: string
  is_published: number
  edited_at: number | null
  synced_at: number
}

export class PageRepository extends BaseRepository<CoursePage, PageRow> {
  protected get tableName() { return 'pages' }

  protected fromRow(row: PageRow): CoursePage {
    return {
      id:          row.id,
      courseId:    row.course_id,
      externalId:  row.external_id,
      title:       row.title,
      bodyHtml:    row.body_html,
      url:         row.url,
      isPublished: row.is_published === 1,
      editedAt:    row.edited_at,
      syncedAt:    row.synced_at,
    }
  }

  protected toRow(p: Partial<CoursePage>): Partial<PageRow> {
    const row: Partial<PageRow> = {}
    if (p.id          !== undefined) row.id           = p.id
    if (p.courseId    !== undefined) row.course_id    = p.courseId
    if (p.externalId  !== undefined) row.external_id  = p.externalId
    if (p.title       !== undefined) row.title        = p.title
    if (p.bodyHtml    !== undefined) row.body_html     = p.bodyHtml
    if (p.url         !== undefined) row.url          = p.url
    if (p.isPublished !== undefined) row.is_published = p.isPublished ? 1 : 0
    if (p.editedAt    !== undefined) row.edited_at    = p.editedAt
    if (p.syncedAt    !== undefined) row.synced_at    = p.syncedAt
    return row
  }

  getByCourse(courseId: string): CoursePage[] {
    const rows = this.db
      .prepare(`SELECT * FROM pages WHERE course_id = ? ORDER BY title ASC`)
      .all(courseId) as PageRow[]
    return rows.map(r => this.fromRow(r))
  }

  getById(id: string): CoursePage | undefined {
    return this.findById(id)
  }

  // Module items of type "Page" reference pages by (course_id, url) rather
  // than a content_id — Canvas uses the page's URL slug as its identifier
  // inside modules, so this is the lookup the renderer actually needs when
  // a user clicks a Page module item.
  getByCourseAndUrl(courseId: string, url: string): CoursePage | undefined {
    const row = this.db
      .prepare(`SELECT * FROM pages WHERE course_id = ? AND url = ?`)
      .get(courseId, url) as PageRow | undefined
    return row ? this.fromRow(row) : undefined
  }

  save(page: CoursePage): void          { this.upsert(page) }
  saveMany(pages: CoursePage[]): void   { this.upsertMany(pages) }
}
