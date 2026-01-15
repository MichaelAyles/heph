/**
 * D1 Checkpointer for LangGraph
 *
 * Custom checkpointer implementation that persists LangGraph state
 * to Cloudflare D1 SQLite database for resume capability.
 *
 * Note: This is a simplified implementation for single-process use.
 * For production with concurrent writers, consider using the
 * official PostgresSaver with Cloudflare Hyperdrive.
 */

import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
  type SerializerProtocol,
} from '@langchain/langgraph-checkpoint'
import type { RunnableConfig } from '@langchain/core/runnables'

// =============================================================================
// D1 Database Interface (Cloudflare Workers)
// =============================================================================

/**
 * Cloudflare D1 database interface
 * This matches the D1Database type from @cloudflare/workers-types
 */
export interface D1Database {
  prepare(sql: string): D1PreparedStatement
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(sql: string): Promise<D1ExecResult>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(column?: string): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<D1Result<unknown>>
}

export interface D1Result<T> {
  results: T[]
  success: boolean
  meta?: {
    duration: number
    changes: number
    last_row_id: number
  }
}

export interface D1ExecResult {
  count: number
  duration: number
}

// =============================================================================
// CHECKPOINT ROW TYPE
// =============================================================================

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

interface PendingWriteRow {
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
// D1 CHECKPOINTER
// =============================================================================

/**
 * D1Checkpointer - Persists LangGraph checkpoints to Cloudflare D1
 *
 * Usage:
 * ```typescript
 * const checkpointer = new D1Checkpointer(env.DB)
 * const graph = createGraph().compile({ checkpointer })
 * ```
 */
export class D1Checkpointer extends BaseCheckpointSaver {
  private db: D1Database
  private isSetup = false

  constructor(db: D1Database, serde?: SerializerProtocol) {
    super(serde)
    this.db = db
  }

  /**
   * Ensure tables exist (idempotent)
   */
  private async setup(): Promise<void> {
    if (this.isSetup) return

    // Note: Tables should be created via migrations in production
    // This is a fallback for development/testing
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS orchestrator_checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type TEXT,
        checkpoint TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      );

      CREATE TABLE IF NOT EXISTS orchestrator_pending_writes (
        thread_id TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        channel TEXT NOT NULL,
        type TEXT,
        value TEXT NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_created
      ON orchestrator_checkpoints(thread_id, checkpoint_ns, created_at DESC);
    `)

    this.isSetup = true
  }

  /**
   * Get a single checkpoint tuple by config
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    await this.setup()

    const threadId = config.configurable?.thread_id as string
    const checkpointNs = (config.configurable?.checkpoint_ns as string) || ''
    const checkpointId = config.configurable?.checkpoint_id as string | undefined

    if (!threadId) {
      throw new Error('thread_id is required in config.configurable')
    }

    let row: CheckpointRow | null

    if (checkpointId) {
      // Fetch specific checkpoint
      row = await this.db
        .prepare(
          `SELECT * FROM orchestrator_checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`
        )
        .bind(threadId, checkpointNs, checkpointId)
        .first<CheckpointRow>()
    } else {
      // Fetch latest checkpoint
      row = await this.db
        .prepare(
          `SELECT * FROM orchestrator_checkpoints
           WHERE thread_id = ? AND checkpoint_ns = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .bind(threadId, checkpointNs)
        .first<CheckpointRow>()
    }

    if (!row) {
      return undefined
    }

    // Fetch pending writes for this checkpoint
    const writesResult = await this.db
      .prepare(
        `SELECT * FROM orchestrator_pending_writes
         WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
         ORDER BY idx`
      )
      .bind(threadId, checkpointNs, row.checkpoint_id)
      .all<PendingWriteRow>()

    const pendingWrites = await Promise.all(
      writesResult.results.map(async (w) => ({
        taskId: w.task_id,
        channel: w.channel,
        value: await this.serde.loadsTyped(w.type || 'json', w.value),
      }))
    )

    // Deserialize checkpoint and metadata
    const checkpoint = (await this.serde.loadsTyped(
      row.type || 'json',
      row.checkpoint
    )) as Checkpoint

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
      pendingWrites: pendingWrites.map((w) => [w.taskId, w.channel, w.value]),
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

  /**
   * List checkpoints matching config and options
   */
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    await this.setup()

    const threadId = config.configurable?.thread_id as string
    const checkpointNs = (config.configurable?.checkpoint_ns as string) || ''

    if (!threadId) {
      throw new Error('thread_id is required in config.configurable')
    }

    const limit = options?.limit ?? 100
    const before = options?.before?.configurable?.checkpoint_id

    let query = `
      SELECT * FROM orchestrator_checkpoints
      WHERE thread_id = ? AND checkpoint_ns = ?
    `
    const params: unknown[] = [threadId, checkpointNs]

    if (before) {
      query += ` AND created_at < (
        SELECT created_at FROM orchestrator_checkpoints
        WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
      )`
      params.push(threadId, checkpointNs, before)
    }

    query += ` ORDER BY created_at DESC LIMIT ?`
    params.push(limit)

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all<CheckpointRow>()

    for (const row of result.results) {
      const checkpoint = (await this.serde.loadsTyped(
        row.type || 'json',
        row.checkpoint
      )) as Checkpoint

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
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    await this.setup()

    const threadId = config.configurable?.thread_id as string
    const checkpointNs = (config.configurable?.checkpoint_ns as string) || ''
    const parentCheckpointId = config.configurable?.checkpoint_id as string | undefined

    if (!threadId) {
      throw new Error('thread_id is required in config.configurable')
    }

    const checkpointId = checkpoint.id

    // Serialize checkpoint
    const [type, serializedCheckpoint] = await this.serde.dumpsTyped(checkpoint)

    await this.db
      .prepare(
        `INSERT INTO orchestrator_checkpoints
         (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id)
         DO UPDATE SET
           checkpoint = excluded.checkpoint,
           metadata = excluded.metadata,
           parent_checkpoint_id = excluded.parent_checkpoint_id`
      )
      .bind(
        threadId,
        checkpointNs,
        checkpointId,
        parentCheckpointId ?? null,
        type,
        serializedCheckpoint,
        JSON.stringify(metadata)
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
   * Save pending writes for a checkpoint
   */
  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    await this.setup()

    const threadId = config.configurable?.thread_id as string
    const checkpointNs = (config.configurable?.checkpoint_ns as string) || ''
    const checkpointId = config.configurable?.checkpoint_id as string

    if (!threadId || !checkpointId) {
      throw new Error('thread_id and checkpoint_id are required in config.configurable')
    }

    // Batch insert pending writes
    const statements = await Promise.all(
      writes.map(async (write, idx) => {
        const [channel, value] = write
        const [type, serializedValue] = await this.serde.dumpsTyped(value)

        return this.db
          .prepare(
            `INSERT INTO orchestrator_pending_writes
             (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
             DO UPDATE SET channel = excluded.channel, type = excluded.type, value = excluded.value`
          )
          .bind(threadId, checkpointNs, checkpointId, taskId, idx, channel, type, serializedValue)
      })
    )

    if (statements.length > 0) {
      await this.db.batch(statements)
    }
  }

  /**
   * Delete all checkpoints for a thread
   */
  async deleteThread(threadId: string): Promise<void> {
    await this.setup()

    await this.db.batch([
      this.db
        .prepare('DELETE FROM orchestrator_pending_writes WHERE thread_id = ?')
        .bind(threadId),
      this.db
        .prepare('DELETE FROM orchestrator_checkpoints WHERE thread_id = ?')
        .bind(threadId),
    ])
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a D1 checkpointer instance
 *
 * @param db - Cloudflare D1 database binding
 * @returns D1Checkpointer instance
 *
 * @example
 * ```typescript
 * // In a Cloudflare Worker/Pages Function:
 * const checkpointer = createD1Checkpointer(env.DB)
 * const graph = createOrchestratorGraph().compile({ checkpointer })
 * ```
 */
export function createD1Checkpointer(db: D1Database): D1Checkpointer {
  return new D1Checkpointer(db)
}
