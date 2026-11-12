/**
 * sample-repo/database-client.ts
 *
 * Pre-loaded sample: lightweight DatabaseClient stub used by other
 * sample files. Intentionally has no error handling on the connection.
 */

export class DatabaseClient {
  private connected = false;

  /** Connects without error handling — uncaught exception path. */
  async connect(): Promise<void> {
    // No try/catch — if connection fails it throws uncaught
    this.connected = true;
  }

  async query(
    sql: string,
    params?: unknown[]
  ): Promise<unknown> {
    if (!this.connected) {
      await this.connect();
    }
    // Stub: returns empty array; real implementation would hit a DB
    return [];
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}
