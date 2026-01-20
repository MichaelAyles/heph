/**
 * D1 Checkpointer for LangGraph
 *
 * Persists LangGraph state to Cloudflare D1 database for pause/resume capability.
 * Uses the existing ProjectSpec.orchestratorState pattern for compatibility.
 */

import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
} from '@langchain/langgraph-checkpoint'

// =============================================================================
// TYPES
// =============================================================================

/**
 * D1 database binding type (from Cloudflare Workers)
 */
interface D1Database {
  prepare(query: string): D1PreparedStatement
  exec(query: string): Promise<D1ExecResult>
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  run(): Promise<D1Result<unknown>>
  all<T = unknown>(): Promise<D1Result<T>>
}

interface D1Result<T> {
  results: T[]
  success: boolean
  meta: {
    changes: number
    duration: number
    last_row_id: number
  }
}

interface D1ExecResult {
  count: number
  duration: number
}

/**
 * Configuration for D1 checkpointer
 */
export interface D1CheckpointerConfig {
  /** D1 database binding */
  db: D1Database
  /** Optional table name (default: 'langgraph_checkpoints') */
  tableName?: string
}

/**
 * Checkpoint row in D1
 */
interface CheckpointRow {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  parent_checkpoint_id: string | null
  type: string
  checkpoint: string // JSON serialized
  metadata: string // JSON serialized
  created_at: string
}

/**
 * Pending write row in D1
 */
interface WriteRow {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  task_id: string
  idx: number
  channel: string
  type: string
  value: string // JSON serialized
}

// =============================================================================
// D1 CHECKPOINTER IMPLEMENTATION
// =============================================================================

/**
 * LangGraph checkpointer that persists to Cloudflare D1.
 *
 * This enables:
 * - Pause/resume of graph execution across requests
 * - State persistence for long-running workflows
 * - Audit trail of state changes
 *
 * @example
 * ```typescript
 * const checkpointer = new D1Checkpointer({ db: env.DB })
 * const graph = createGraph().compile({ checkpointer })
 *
 * // Run with thread_id for persistence
 * const result = await graph.invoke(input, {
 *   configurable: { thread_id: projectId }
 * })
 *
 * // Resume later
 * const state = await graph.getState({ configurable: { thread_id: projectId } })
 * ```
 */
export class D1Checkpointer extends BaseCheckpointSaver {
  private db: D1Database
  private tableName: string

  constructor(config: D1CheckpointerConfig) {
    super()
    this.db = config.db
    this.tableName = config.tableName ?? 'langgraph_checkpoints'
  }

  /**
   * Get a checkpoint tuple by thread_id and optional checkpoint_id
   */
  async getTuple(config: {
    configurable?: {
      thread_id?: string
      checkpoint_ns?: string
      checkpoint_id?: string
    }
  }): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id
    const checkpointNs = config.configurable?.checkpoint_ns ?? ''
    const checkpointId = config.configurable?.checkpoint_id

    if (!threadId) {
      return undefined
    }

    let row: CheckpointRow | null

    if (checkpointId) {
      // Get specific checkpoint
      row = await this.db
        .prepare(
          `SELECT * FROM ${this.tableName}
           WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`
        )
        .bind(threadId, checkpointNs, checkpointId)
        .first<CheckpointRow>()
    } else {
      // Get latest checkpoint
      row = await this.db
        .prepare(
          `SELECT * FROM ${this.tableName}
           WHERE thread_id = ? AND checkpoint_ns = ?
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .bind(threadId, checkpointNs)
        .first<CheckpointRow>()
    }

    if (!row) {
      return undefined
    }

    // Load pending writes for this checkpoint
    const writesResult = await this.db
      .prepare(
        `SELECT * FROM ${this.tableName}_writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
         ORDER BY idx`
      )
      .bind(threadId, checkpointNs, row.checkpoint_id)
      .all<WriteRow>()

    // pendingWrites expected as [task_id, channel, value] tuples
    // Use type assertion due to inconsistent type definitions in langgraph-checkpoint
    const pendingWrites = writesResult.results.map((w) => [
      w.task_id,
      w.channel,
      JSON.parse(w.value),
    ]) as unknown as PendingWrite[]

    const checkpoint = JSON.parse(row.checkpoint) as Checkpoint
    const metadata = JSON.parse(row.metadata) as CheckpointMetadata

    return {
      config: {
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.checkpoint_id,
        },
      },
      checkpoint,
      metadata,
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
    } as unknown as CheckpointTuple
  }

  /**
   * List checkpoints for a thread
   */
  async *list(
    config: {
      configurable?: {
        thread_id?: string
        checkpoint_ns?: string
      }
    },
    options?: {
      limit?: number
      before?: {
        configurable?: {
          checkpoint_id?: string
        }
      }
      filter?: Record<string, unknown>
    }
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id
    const checkpointNs = config.configurable?.checkpoint_ns ?? ''

    if (!threadId) {
      return
    }

    const limit = options?.limit ?? 100
    const beforeId = options?.before?.configurable?.checkpoint_id

    let query = `SELECT * FROM ${this.tableName}
                 WHERE thread_id = ? AND checkpoint_ns = ?`
    const params: unknown[] = [threadId, checkpointNs]

    if (beforeId) {
      query += ` AND created_at < (SELECT created_at FROM ${this.tableName} WHERE checkpoint_id = ?)`
      params.push(beforeId)
    }

    query += ` ORDER BY created_at DESC LIMIT ?`
    params.push(limit)

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all<CheckpointRow>()

    for (const row of result.results) {
      const checkpoint = JSON.parse(row.checkpoint) as Checkpoint
      const metadata = JSON.parse(row.metadata) as CheckpointMetadata

      yield {
        config: {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.checkpoint_ns,
            checkpoint_id: row.checkpoint_id,
          },
        },
        checkpoint,
        metadata,
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
      configurable?: {
        thread_id?: string
        checkpoint_ns?: string
        checkpoint_id?: string
      }
    },
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, string | number>
  ): Promise<{
    configurable: {
      thread_id: string
      checkpoint_ns: string
      checkpoint_id: string
    }
  }> {
    const threadId = config.configurable?.thread_id
    if (!threadId) {
      throw new Error('thread_id is required for D1Checkpointer')
    }

    const checkpointNs = config.configurable?.checkpoint_ns ?? ''
    const checkpointId = checkpoint.id

    // Get parent checkpoint id
    const parentCheckpointId = config.configurable?.checkpoint_id ?? null

    await this.db
      .prepare(
        `INSERT OR REPLACE INTO ${this.tableName}
         (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        threadId,
        checkpointNs,
        checkpointId,
        parentCheckpointId,
        'checkpoint',
        JSON.stringify(checkpoint),
        JSON.stringify(metadata),
        new Date().toISOString()
      )
      .run()

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      },
    }
  }

  /**
   * Store pending writes for a checkpoint
   */
  async putWrites(
    config: {
      configurable?: {
        thread_id?: string
        checkpoint_ns?: string
        checkpoint_id?: string
      }
    },
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id
    const checkpointNs = config.configurable?.checkpoint_ns ?? ''
    const checkpointId = config.configurable?.checkpoint_id

    if (!threadId || !checkpointId) {
      throw new Error('thread_id and checkpoint_id are required for putWrites')
    }

    // Delete existing writes for this task
    await this.db
      .prepare(
        `DELETE FROM ${this.tableName}_writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ? AND task_id = ?`
      )
      .bind(threadId, checkpointNs, checkpointId, taskId)
      .run()

    // Insert new writes - use type assertion due to inconsistent library types
    for (let i = 0; i < writes.length; i++) {
      const write = writes[i] as unknown as [string, string, unknown]
      const [writeTaskId, channel, value] = write
      await this.db
        .prepare(
          `INSERT INTO ${this.tableName}_writes
           (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          threadId,
          checkpointNs,
          checkpointId,
          writeTaskId ?? taskId,
          i,
          channel,
          typeof value,
          JSON.stringify(value)
        )
        .run()
    }
  }

  /**
   * Delete all checkpoints for a thread (required by BaseCheckpointSaver)
   */
  async deleteThread(threadId: string): Promise<void> {
    await this.db
      .prepare(`DELETE FROM ${this.tableName}_writes WHERE thread_id = ?`)
      .bind(threadId)
      .run()

    await this.db.prepare(`DELETE FROM ${this.tableName} WHERE thread_id = ?`).bind(threadId).run()
  }

  /**
   * Get the latest state for a thread
   */
  async getLatestState(threadId: string): Promise<unknown | null> {
    const tuple = await this.getTuple({
      configurable: { thread_id: threadId },
    })

    if (!tuple) return null

    return tuple.checkpoint.channel_values
  }
}

// =============================================================================
// MIGRATION SQL
// =============================================================================

/**
 * SQL to create the checkpoints table.
 * Run this migration before using the checkpointer.
 */
export const CREATE_CHECKPOINTS_TABLE_SQL = `
-- Checkpoints table
CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT NOT NULL DEFAULT 'checkpoint',
  checkpoint TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

-- Index for listing checkpoints
CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_created
ON langgraph_checkpoints(thread_id, checkpoint_ns, created_at DESC);

-- Pending writes table
CREATE TABLE IF NOT EXISTS langgraph_checkpoints_writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);
`

// =============================================================================
// IN-MEMORY CHECKPOINTER (for testing/development)
// =============================================================================

/**
 * Simple in-memory checkpointer for testing without D1.
 */
export class MemoryCheckpointer extends BaseCheckpointSaver {
  private checkpoints: Map<string, CheckpointTuple[]> = new Map()
  private writes: Map<string, PendingWrite[]> = new Map()

  private getKey(threadId: string, ns: string): string {
    return `${threadId}:${ns}`
  }

  async getTuple(config: {
    configurable?: {
      thread_id?: string
      checkpoint_ns?: string
      checkpoint_id?: string
    }
  }): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id
    if (!threadId) return undefined

    const ns = config.configurable?.checkpoint_ns ?? ''
    const checkpointId = config.configurable?.checkpoint_id
    const key = this.getKey(threadId, ns)

    const tuples = this.checkpoints.get(key) ?? []

    if (checkpointId) {
      return tuples.find((t) => t.checkpoint.id === checkpointId)
    }

    return tuples[tuples.length - 1]
  }

  async *list(
    config: {
      configurable?: {
        thread_id?: string
        checkpoint_ns?: string
      }
    },
    options?: {
      limit?: number
    }
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id
    if (!threadId) return

    const ns = config.configurable?.checkpoint_ns ?? ''
    const key = this.getKey(threadId, ns)
    const tuples = this.checkpoints.get(key) ?? []
    const limit = options?.limit ?? tuples.length

    for (let i = tuples.length - 1; i >= 0 && i >= tuples.length - limit; i--) {
      yield tuples[i]
    }
  }

  async put(
    config: {
      configurable?: {
        thread_id?: string
        checkpoint_ns?: string
        checkpoint_id?: string
      }
    },
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, string | number>
  ): Promise<{
    configurable: {
      thread_id: string
      checkpoint_ns: string
      checkpoint_id: string
    }
  }> {
    const threadId = config.configurable?.thread_id
    if (!threadId) throw new Error('thread_id required')

    const ns = config.configurable?.checkpoint_ns ?? ''
    const key = this.getKey(threadId, ns)

    const tuples = this.checkpoints.get(key) ?? []
    const parentCheckpointId = config.configurable?.checkpoint_id

    tuples.push({
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: ns,
          checkpoint_id: checkpoint.id,
        },
      },
      checkpoint,
      metadata,
      parentConfig: parentCheckpointId
        ? {
            configurable: {
              thread_id: threadId,
              checkpoint_ns: ns,
              checkpoint_id: parentCheckpointId,
            },
          }
        : undefined,
    })

    this.checkpoints.set(key, tuples)

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: ns,
        checkpoint_id: checkpoint.id,
      },
    }
  }

  async putWrites(
    config: {
      configurable?: {
        thread_id?: string
        checkpoint_ns?: string
        checkpoint_id?: string
      }
    },
    writes: PendingWrite[],
    _taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id
    const checkpointId = config.configurable?.checkpoint_id
    if (!threadId || !checkpointId) return

    const key = `${threadId}:${checkpointId}`
    this.writes.set(key, writes)
  }

  async deleteThread(threadId: string): Promise<void> {
    // Delete all checkpoints for this thread
    for (const key of this.checkpoints.keys()) {
      if (key.startsWith(`${threadId}:`)) {
        this.checkpoints.delete(key)
      }
    }
    // Delete all writes for this thread
    for (const key of this.writes.keys()) {
      if (key.startsWith(`${threadId}:`)) {
        this.writes.delete(key)
      }
    }
  }

  clear(): void {
    this.checkpoints.clear()
    this.writes.clear()
  }
}
