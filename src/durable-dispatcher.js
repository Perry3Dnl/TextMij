// MySQL-mediated single global cadence across all app processes.
// MySQL advisory locks only guard an individual dispatch decision, not a network send.
export class DurableDispatcher {
  constructor(pool, { onError = error => console.error('Encrypted dispatch failed', error.message) } = {}) {
    this.pool = pool;
    this.onError = onError;
    this.timer = null;
    this.busy = false;
  }
  async tick() {
    if (this.busy) return false;
    this.busy = true;
    let connection, locked = false;
    try {
      connection = await this.pool.getConnection();
      const [[result]] = await connection.query("SELECT GET_LOCK('textmij_outbox_dispatch_v1', 0) AS locked");
      if (result.locked !== 1) return false;
      locked = true;
      await connection.beginTransaction();
      const [[clock]] = await connection.query(
        'SELECT last_dispatch, TIMESTAMPDIFF(MICROSECOND,last_dispatch,NOW(6)) AS elapsed FROM dispatch_clock WHERE singleton_id = 1 FOR UPDATE');
      if (!clock || (clock.last_dispatch !== null && Number(clock.elapsed) < 3_000_000)) {
        await connection.rollback();
        return false;
      }
      const [rows] = await connection.query(
        "SELECT id FROM encrypted_messages WHERE status = 'queued' ORDER BY CASE WHEN tier_at_acceptance = 'premium' THEN 0 ELSE 1 END, id ASC LIMIT 1 FOR UPDATE");
      if (!rows.length) { await connection.rollback(); return false; }
      const [update] = await connection.execute(
        "UPDATE encrypted_messages SET status = 'dispatched', dispatched_at = NOW(6) WHERE id = ? AND status = 'queued'",
        [rows[0].id]);
      if (update.affectedRows !== 1) throw new Error('Dispatch lost row lock');
      await connection.query('UPDATE dispatch_clock SET last_dispatch = NOW(6) WHERE singleton_id = 1');
      await connection.commit();
      return true;
    } catch (error) {
      if (connection) try { await connection.rollback(); } catch {}
      this.onError(error);
      return false;
    } finally {
      if (locked && connection) try { await connection.query("SELECT RELEASE_LOCK('textmij_outbox_dispatch_v1')"); } catch {}
      connection?.release();
      this.busy = false;
    }
  }
  start() {
    if (this.timer) return;
    // Begin polling immediately rather than waiting 3 seconds for the first tick.
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, 500);
    this.timer.unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
