import { getDb } from '../index'
import type { WidgetLayout, WidgetInstance, UserWidgetAsset, WidgetMode } from '@shared/types/entities'

// Dashboard widget persistence. Spans three tables (widget_layouts,
// widget_instances, user_widget_assets), so this is a direct-db repository
// (like WhatIfScoreRepository) rather than a single-table BaseRepository.

export const DEFAULT_LAYOUT_ID = 'default'

interface LayoutRow { id: string; mode: string; layout_json: string; updated_at: number }
interface InstanceRow {
  id: string; layout_id: string; widget_type: string; title: string | null
  config_json: string; pos_x: number; pos_y: number; width: number; height: number
  is_locked: number; updated_at: number
}
interface AssetRow { id: string; name: string; file_path: string; file_type: string; created_at: number }

function layoutFromRow(r: LayoutRow): WidgetLayout {
  return { id: r.id, mode: r.mode as WidgetMode, layoutJson: r.layout_json, updatedAt: r.updated_at }
}
function instanceFromRow(r: InstanceRow): WidgetInstance {
  return {
    id: r.id, layoutId: r.layout_id, widgetType: r.widget_type, title: r.title,
    configJson: r.config_json, posX: r.pos_x, posY: r.pos_y, width: r.width, height: r.height,
    isLocked: r.is_locked === 1, updatedAt: r.updated_at,
  }
}
function assetFromRow(r: AssetRow): UserWidgetAsset {
  return { id: r.id, name: r.name, filePath: r.file_path, fileType: r.file_type, createdAt: r.created_at }
}

export class WidgetRepository {
  private get db() { return getDb() }

  // ─── Layout ───────────────────────────────────────────────────────────────

  getOrCreateDefaultLayout(): WidgetLayout {
    const existing = this.db
      .prepare(`SELECT * FROM widget_layouts WHERE id = ?`)
      .get(DEFAULT_LAYOUT_ID) as LayoutRow | undefined
    if (existing) return layoutFromRow(existing)

    const now = Date.now()
    this.db.prepare(`
      INSERT INTO widget_layouts (id, mode, layout_json, updated_at) VALUES (?, 'grid', '[]', ?)
    `).run(DEFAULT_LAYOUT_ID, now)
    return { id: DEFAULT_LAYOUT_ID, mode: 'grid', layoutJson: '[]', updatedAt: now }
  }

  saveLayout(patch: { mode?: WidgetMode; layoutJson?: string }): WidgetLayout {
    const current = this.getOrCreateDefaultLayout()
    const mode = patch.mode ?? current.mode
    const layoutJson = patch.layoutJson ?? current.layoutJson
    const now = Date.now()
    this.db.prepare(`
      UPDATE widget_layouts SET mode = ?, layout_json = ?, updated_at = ? WHERE id = ?
    `).run(mode, layoutJson, now, DEFAULT_LAYOUT_ID)
    return { id: DEFAULT_LAYOUT_ID, mode, layoutJson, updatedAt: now }
  }

  // ─── Instances ──────────────────────────────────────────────────────────────

  getInstances(layoutId: string = DEFAULT_LAYOUT_ID): WidgetInstance[] {
    const rows = this.db
      .prepare(`SELECT * FROM widget_instances WHERE layout_id = ? ORDER BY updated_at ASC`)
      .all(layoutId) as InstanceRow[]
    return rows.map(instanceFromRow)
  }

  saveInstance(w: WidgetInstance): void {
    this.db.prepare(`
      INSERT INTO widget_instances
        (id, layout_id, widget_type, title, config_json, pos_x, pos_y, width, height, is_locked, updated_at)
      VALUES (@id, @layout_id, @widget_type, @title, @config_json, @pos_x, @pos_y, @width, @height, @is_locked, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        layout_id = excluded.layout_id, widget_type = excluded.widget_type, title = excluded.title,
        config_json = excluded.config_json, pos_x = excluded.pos_x, pos_y = excluded.pos_y,
        width = excluded.width, height = excluded.height, is_locked = excluded.is_locked,
        updated_at = excluded.updated_at
    `).run({
      id: w.id, layout_id: w.layoutId, widget_type: w.widgetType, title: w.title,
      config_json: w.configJson, pos_x: w.posX, pos_y: w.posY, width: w.width, height: w.height,
      is_locked: w.isLocked ? 1 : 0, updated_at: w.updatedAt,
    })
  }

  removeInstance(id: string): void {
    this.db.prepare(`DELETE FROM widget_instances WHERE id = ?`).run(id)
  }

  // ─── Assets ───────────────────────────────────────────────────────────────

  getAssets(): UserWidgetAsset[] {
    const rows = this.db
      .prepare(`SELECT * FROM user_widget_assets ORDER BY created_at DESC`)
      .all() as AssetRow[]
    return rows.map(assetFromRow)
  }

  saveAsset(a: UserWidgetAsset): void {
    this.db.prepare(`
      INSERT INTO user_widget_assets (id, name, file_path, file_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(a.id, a.name, a.filePath, a.fileType, a.createdAt)
  }

  getAsset(id: string): UserWidgetAsset | undefined {
    const row = this.db.prepare(`SELECT * FROM user_widget_assets WHERE id = ?`).get(id) as AssetRow | undefined
    return row ? assetFromRow(row) : undefined
  }

  deleteAsset(id: string): void {
    this.db.prepare(`DELETE FROM user_widget_assets WHERE id = ?`).run(id)
  }
}
