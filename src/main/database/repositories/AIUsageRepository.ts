// Direct-db repository (like WhatIfScore/SimulationScore) for AI usage metering.
// ai_usage holds one row per (provider, model, local-day); the row id is the
// deterministic key `${provider}:${model}:${dateKey}` so incrementUsage upserts.
import { getDb } from '../index'
import type { AIUsage, UsageFraction } from '@shared/types/entities'

interface AIUsageRow {
  id: string
  provider: string
  model: string
  date_key: string
  tokens_in: number
  tokens_out: number
  request_count: number
  estimated_cost: number
  updated_at: number
}

const FREE_DAILY_CAP = 1000

export class AIUsageRepository {
  private get db() { return getDb() }

  private fromRow(r: AIUsageRow): AIUsage {
    return {
      provider:      r.provider,
      model:         r.model,
      dateKey:       r.date_key,
      tokensIn:      r.tokens_in,
      tokensOut:     r.tokens_out,
      requestCount:  r.request_count,
      estimatedCost: r.estimated_cost,
      updatedAt:     r.updated_at,
    }
  }

  /** Upsert today's (provider, model) usage row, adding the deltas. */
  incrementUsage(provider: string, model: string, tokensIn: number, tokensOut: number, cost: number): void {
    const date = localDateKey()
    const id = `${provider}:${model}:${date}`
    this.db.prepare(`
      INSERT INTO ai_usage (id, provider, model, date_key, tokens_in, tokens_out, request_count, estimated_cost, updated_at)
      VALUES (@id, @provider, @model, @date, @tin, @tout, 1, @cost, @now)
      ON CONFLICT(id) DO UPDATE SET
        tokens_in      = tokens_in     + excluded.tokens_in,
        tokens_out     = tokens_out    + excluded.tokens_out,
        request_count  = request_count + 1,
        estimated_cost = estimated_cost + excluded.estimated_cost,
        updated_at     = excluded.updated_at
    `).run({ id, provider, model, date, tin: tokensIn, tout: tokensOut, cost, now: Date.now() })
  }

  /** Total requests made today for a provider (across all its models). */
  getTodayRequestCount(provider: string): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(request_count), 0) AS n FROM ai_usage WHERE provider = ? AND date_key = ?`,
    ).get(provider, localDateKey()) as { n: number }
    return row.n
  }

  /** Aggregated usage for a provider today (model='*'), or undefined if none. */
  getToday(provider: string): AIUsage | undefined {
    const date = localDateKey()
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(tokens_in),0) AS tin, COALESCE(SUM(tokens_out),0) AS tout,
             COALESCE(SUM(request_count),0) AS req, COALESCE(SUM(estimated_cost),0) AS cost,
             COALESCE(MAX(updated_at),0) AS upd
      FROM ai_usage WHERE provider = ? AND date_key = ?
    `).get(provider, date) as { tin: number; tout: number; req: number; cost: number; upd: number }
    if (!row.req && !row.tin && !row.tout) return undefined
    return {
      provider, model: '*', dateKey: date,
      tokensIn: row.tin, tokensOut: row.tout, requestCount: row.req,
      estimatedCost: row.cost, updatedAt: row.upd,
    }
  }

  /** All per-model rows for the current month for a provider. */
  getThisMonth(provider: string): AIUsage[] {
    const rows = this.db.prepare(
      `SELECT * FROM ai_usage WHERE provider = ? AND date_key LIKE ? ORDER BY date_key DESC`,
    ).all(provider, `${monthKey()}%`) as AIUsageRow[]
    return rows.map(r => this.fromRow(r))
  }

  /** Sum of estimated cost for a provider since a 'YYYY-MM-DD' date (inclusive). */
  getTotalCost(provider: string, sinceDate: string): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(estimated_cost),0) AS c FROM ai_usage WHERE provider = ? AND date_key >= ?`,
    ).get(provider, sinceDate) as { c: number }
    return row.c
  }

  /** Sum of total tokens (in+out) for a provider this month. */
  private monthTokens(provider: string): number {
    const row = this.db.prepare(
      `SELECT COALESCE(SUM(tokens_in + tokens_out),0) AS t FROM ai_usage WHERE provider = ? AND date_key LIKE ?`,
    ).get(provider, `${monthKey()}%`) as { t: number }
    return row.t
  }

  /**
   * The 0..1 usage fraction that drives the mascot mood + usage meter.
   * Free tier → daily request cap (hard stop). BYOK → monthly token budget
   * (soft warning; caller decides whether to allow over-budget sends).
   */
  getUsageFraction(provider: string, dailyCap = FREE_DAILY_CAP, monthlyTokenBudget?: number): UsageFraction {
    if (provider === 'free') {
      const count = this.getTodayRequestCount('free')
      const fraction = Math.min(count / dailyCap, 1)
      return {
        fraction,
        label: `Free tier — ${count} of ${dailyCap} daily requests`,
        provider,
        isAtLimit: count >= dailyCap,
        resetsAt: nextUtcMidnightISO(),
      }
    }
    const tokens = this.monthTokens(provider)
    if (monthlyTokenBudget && monthlyTokenBudget > 0) {
      const fraction = Math.min(tokens / monthlyTokenBudget, 1)
      return {
        fraction,
        label: `BYOK — ${fmtTokens(tokens)} of ${fmtTokens(monthlyTokenBudget)} monthly tokens`,
        provider,
        isAtLimit: tokens >= monthlyTokenBudget,
        resetsAt: null,
      }
    }
    return {
      fraction: 0,
      label: `BYOK — ${fmtTokens(tokens)} tokens this month`,
      provider,
      isAtLimit: false,
      resetsAt: null,
    }
  }
}

// ─── Date helpers ────────────────────────────────────────────────────────────
function localDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function nextUtcMidnightISO(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
