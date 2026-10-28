import { httpError } from './http-json.js';

export const BLOCK_QUERY = 'SELECT blocker_id,blocked_id FROM account_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)';

// Blocking and accepting a message lock the same two accounts in stable order.
export async function lockConversation(connection, first, second) {
  const ids=[first,second].sort();
  const [rows]=await connection.execute('SELECT id FROM accounts WHERE id IN (?,?) ORDER BY id FOR UPDATE',ids);
  if(rows.length!==2) throw httpError(404,'Contact not found');
}

export async function hasBlock(connection, first, second) {
  const [rows]=await connection.execute(BLOCK_QUERY,[first,second,second,first]);
  return rows.length>0;
}
