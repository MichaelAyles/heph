/**
 * D1 Checkpointer for LangGraph
 *
 * Provides checkpoint storage using Cloudflare D1.
 * Supports subgraph namespacing via checkpoint_ns field.
 *
 * Note: This is a standalone implementation that doesn't directly implement
 * BaseCheckpointSaver due to version-specific type constraints. It provides
 * the same functionality and can be used for manual checkpoint management.
 *
 * Database tables (from migration 0023_langgraph_checkpoints.sql):
 * - langgraph_checkpoints: Main checkpoint storage
 * - langgraph_checkpoints_writes: Pending writes during execution
 */

import type { Checkpoint, CheckpointMetadata, CheckpointTuple } from '@langchain/langgraph'

// =============================================================================
// Types
// =============================================================================

// Use type alias for D1Database since it's from Cloudflare Workers runtime
type D1DatabaseType = {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
}

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(columnName?: string): Promise<T | null>
  run(): Promise<D1Result<unknown>>
  all<T = unknown>(): Promise<D1Result<T>>
}

type D1Result<T> = {
  results?: T[]
  success: boolean
  error?: string
}

// Type for pending writes (array of [taskId, channel, value])
type PendingWriteItem = [string, string, unknown]

/**
 * Checkpoint configuration for D1
 */
export interface D1CheckpointerConfig {
  /** Cloudflare D1 database binding */
  db: D1DatabaseType
}

/**
 * Checkpoint key for D1 storage
 */
export interface CheckpointKey {
  threadId: string
  checkpointNs: string
  checkpointId: string
}

/**
 * Row type from D1 checkpoints table
 */
interface CheckpointRow {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  parent_checkpoint_id: string | null
  type: string
  checkpoint: string
  metadata: string
  created_at: string
}

/**
 * Row type from D1 writes table
 */
interface WriteRow {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  task_id: string
  idx: number
  channel: string
  type: string
  value: string
}

// =============================================================================
// D1 Checkpointer Implementation
// =============================================================================

/**
 * D1-backed checkpoint saver for LangGraph
 *
 * This is a simplified implementation that provides basic checkpoint
 * functionality. For full LangGraph compatibility, consider using
 * the official @langchain/langgraph-checkpoint package.
 *
 * Usage:
 * ```typescript
 * const checkpointer = new D1Checkpointer({ db: env.DB })
 * const graph = buildGraph().compile({ checkpointer })
 *
 * // Run with checkpointing
 * await graph.invoke(input, {
 *   configurable: { thread_id: 'session-123' }
 * })
 * ```
 */
export class D1Checkpointer {
  private db: D1DatabaseType

  constructor(config: D1CheckpointerConfig) {
    this.db = config.db
  }

  /**
   * Get a checkpoint tuple by thread ID and optional checkpoint ID
   */
  async getTuple(config: {
    configurable: {
      thread_id: string
      checkpoint_ns?: string
      checkpoint_id?: string
    }
  }): Promise<CheckpointTuple | undefined> {
    const { thread_id, checkpoint_ns = '', checkpoint_id } = config.configurable

    let row: CheckpointRow | null

    if (checkpoint_id) {
      // Get specific checkpoint
      row = await this.db
        .prepare(
          `SELECT * FROM langgraph_checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`
        )
        .bind(thread_id, checkpoint_ns, checkpoint_id)
        .first<CheckpointRow>()
    } else {
      // Get latest checkpoint for thread
      row = await this.db
        .prepare(
          `SELECT * FROM langgraph_checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ?
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .bind(thread_id, checkpoint_ns)
        .first<CheckpointRow>()
    }

    if (!row) {
      return undefined
    }

    // Get pending writes for this checkpoint
    const writes = await this.db
      .prepare(
        `SELECT * FROM langgraph_checkpoints_writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
         ORDER BY idx`
      )
      .bind(thread_id, checkpoint_ns, row.checkpoint_id)
      .all<WriteRow>()

    const pendingWrites: PendingWriteItem[] = (writes.results ?? []).map((w: WriteRow) => [
      w.task_id,
      w.channel,
      JSON.parse(w.value),
    ])

    return {
      config: {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint: JSON.parse(row.checkpoint) as Checkpoint,
      metadata: JSON.parse(row.metadata) as CheckpointMetadata,
      parentConfig: row.parent_checkpoint_id
        ? {
            configurable: {
              thread_id: row.thread_id,
              checkpoint_ns: row.checkpoint_ns,
              checkpoint_id: row.parent_checkpoint_id,
            },
          }
        : undefined,
      pendingWrites,
    }
  }

  /**
   * List checkpoints for a thread
   */
  async *list(
    config: {
      configurable: {
        thread_id: string
        checkpoint_ns?: string
      }
    },
    options?: {
      limit?: number
      before?: { configurable: { checkpoint_id: string } }
    }
  ): AsyncGenerator<CheckpointTuple> {
    const { thread_id, checkpoint_ns = '' } = config.configurable
    const limit = options?.limit ?? 100
    const before = options?.before?.configurable?.checkpoint_id

    let query: string
    let params: (string | number)[]

    if (before) {
      query = `SELECT * FROM langgraph_checkpoints
               WHERE thread_id = ? AND checkpoint_ns = ?
                 AND created_at < (SELECT created_at FROM langgraph_checkpoints
                                   WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?)
               ORDER BY created_at DESC
               LIMIT ?`
      params = [thread_id, checkpoint_ns, thread_id, checkpoint_ns, before, limit]
    } else {
      query = `SELECT * FROM langgraph_checkpoints
               WHERE thread_id = ? AND checkpoint_ns = ?
               ORDER BY created_at DESC
               LIMIT ?`
      params = [thread_id, checkpoint_ns, limit]
    }

    const stmt = this.db.prepare(query)
    const result = await stmt.bind(...params).all<CheckpointRow>()

    for (const row of result.results ?? []) {
      yield {
        config: {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.checkpoint_id,
          },
        },
        checkpoint: JSON.parse(row.checkpoint) as Checkpoint,
        metadata: JSON.parse(row.metadata) as CheckpointMetadata,
        parentConfig: row.parent_checkpoint_id
          ? {
              configurable: {
                thread_id: row.thread_id,
                checkpoint_ns: row.checkpoint_ns,
                checkpoint_id: row.parent_checkpoint_id,
              },
            }
          : undefined,
      }
    }
  }

  /**
   * Save a checkpoint
   */
  async put(
    config: {
      configurable: {
        thread_id: string
        checkpoint_ns?: string
        checkpoint_id?: string
      }
    },
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<{
    configurable: { thread_id: string; checkpoint_ns: string; checkpoint_id: string }
  }> {
    const { thread_id, checkpoint_ns = '' } = config.configurable
    const checkpoint_id = checkpoint.id

    // Get parent checkpoint ID (from current thread's latest checkpoint)
    const parent = await this.db
      .prepare(
        `SELECT checkpoint_id FROM langgraph_checkpoints
         WHERE thread_id = ? AND checkpoint_ns = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .bind(thread_id, checkpoint_ns)
      .first<{ checkpoint_id: string }>()

    const parent_checkpoint_id = parent?.checkpoint_id ?? null

    // Insert or replace checkpoint
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO langgraph_checkpoints
         (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata, created_at)
         VALUES (?, ?, ?, ?, 'checkpoint', ?, ?, datetime('now'))`
      )
      .bind(
        thread_id,
        checkpoint_ns,
        checkpoint_id,
        parent_checkpoint_id,
        JSON.stringify(checkpoint),
        JSON.stringify(metadata)
      )
      .run()

    return {
      configurable: {
        thread_id,
        checkpoint_ns,
        checkpoint_id,
      },
    }
  }

  /**
   * Save pending writes
   */
  async putWrites(
    config: {
      configurable: {
        thread_id: string
        checkpoint_ns?: string
        checkpoint_id: string
      }
    },
    writes: PendingWriteItem[],
    taskId: string
  ): Promise<void> {
    const { thread_id, checkpoint_ns = '', checkpoint_id } = config.configurable

    // Delete existing writes for this task
    await this.db
      .prepare(
        `DELETE FROM langgraph_checkpoints_writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ? AND task_id = ?`
      )
      .bind(thread_id, checkpoint_ns, checkpoint_id, taskId)
      .run()

    // Insert new writes
    for (let idx = 0; idx < writes.length; idx++) {
      const [, channel, value] = writes[idx]
      await this.db
        .prepare(
          `INSERT INTO langgraph_checkpoints_writes
           (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
           VALUES (?, ?, ?, ?, ?, ?, 'json', ?)`
        )
        .bind(thread_id, checkpoint_ns, checkpoint_id, taskId, idx, channel, JSON.stringify(value))
        .run()
    }
  }

  // =============================================================================
  // Helper Methods for Subgraph Support
  // =============================================================================

  /**
   * Get all namespaces for a thread
   */
  async getNamespaces(threadId: string): Promise<string[]> {
    const result = await this.db
      .prepare(
        `SELECT DISTINCT checkpoint_ns FROM langgraph_checkpoints
         WHERE thread_id = ?
         ORDER BY checkpoint_ns`
      )
      .bind(threadId)
      .all<{ checkpoint_ns: string }>()

    return (result.results ?? []).map((r: { checkpoint_ns: string }) => r.checkpoint_ns)
  }

  /**
   * Get the latest checkpoint for each namespace in a thread
   */
  async getLatestByNamespace(threadId: string): Promise<Map<string, CheckpointTuple>> {
    const namespaces = await this.getNamespaces(threadId)
    const result = new Map<string, CheckpointTuple>()

    for (const ns of namespaces) {
      const tuple = await this.getTuple({
        configurable: {
          thread_id: threadId,
          checkpoint_ns: ns,
        },
      })
      if (tuple) {
        result.set(ns, tuple)
      }
    }

    return result
  }

  /**
   * Delete all checkpoints for a thread
   */
  async deleteThread(threadId: string): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(`DELETE FROM langgraph_checkpoints_writes WHERE thread_id = ?`)
        .bind(threadId),
      this.db.prepare(`DELETE FROM langgraph_checkpoints WHERE thread_id = ?`).bind(threadId),
    ])
  }

  /**
   * Delete checkpoints for a specific namespace in a thread
   */
  async deleteNamespace(threadId: string, checkpointNs: string): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM langgraph_checkpoints_writes
           WHERE thread_id = ? AND checkpoint_ns = ?`
        )
        .bind(threadId, checkpointNs),
      this.db
        .prepare(
          `DELETE FROM langgraph_checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ?`
        )
        .bind(threadId, checkpointNs),
    ])
  }

  /**
   * Get checkpoint history for a thread
   */
  async getHistory(
    threadId: string,
    options?: {
      checkpointNs?: string
      limit?: number
    }
  ): Promise<
    Array<{
      checkpointId: string
      checkpointNs: string
      parentCheckpointId: string | null
      createdAt: string
      metadata: CheckpointMetadata
    }>
  > {
    const { checkpointNs, limit = 50 } = options ?? {}

    let query: string
    let params: (string | number)[]

    if (checkpointNs !== undefined) {
      query = `SELECT checkpoint_id, checkpoint_ns, parent_checkpoint_id, created_at, metadata
               FROM langgraph_checkpoints
               WHERE thread_id = ? AND checkpoint_ns = ?
               ORDER BY created_at DESC
               LIMIT ?`
      params = [threadId, checkpointNs, limit]
    } else {
      query = `SELECT checkpoint_id, checkpoint_ns, parent_checkpoint_id, created_at, metadata
               FROM langgraph_checkpoints
               WHERE thread_id = ?
               ORDER BY created_at DESC
               LIMIT ?`
      params = [threadId, limit]
    }

    interface HistoryRow {
      checkpoint_id: string
      checkpoint_ns: string
      parent_checkpoint_id: string | null
      created_at: string
      metadata: string
    }

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all<HistoryRow>()

    return (result.results ?? []).map((row: HistoryRow) => ({
      checkpointId: row.checkpoint_id,
      checkpointNs: row.checkpoint_ns,
      parentCheckpointId: row.parent_checkpoint_id,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata) as CheckpointMetadata,
    }))
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a D1 checkpointer
 */
export function createD1Checkpointer(db: D1DatabaseType): D1Checkpointer {
  return new D1Checkpointer({ db })
}
