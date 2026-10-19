import * as SQLite from 'expo-sqlite';

let db;

export async function initDB() {
  db = await SQLite.openDatabaseAsync('mychatapp.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar_uri TEXT,
      persona TEXT,
      speaking_style TEXT,
      user_address TEXT,
      welcome_message TEXT,
      memory_enabled INTEGER NOT NULL DEFAULT 1,
      memory_server_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      created_at INTEGER,
      title_manual INTEGER NOT NULL DEFAULT 0,
      finance_reminders_enabled INTEGER NOT NULL DEFAULT 0,
      character_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      role TEXT,
      content TEXT,
      metadata TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS memory_checkpoints (
      conversation_id INTEGER PRIMARY KEY,
      saved_turns INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS context_memories (
      conversation_id INTEGER PRIMARY KEY,
      summary TEXT NOT NULL DEFAULT '', relationship_memory TEXT NOT NULL DEFAULT '',
      user_preferences TEXT NOT NULL DEFAULT '', current_state TEXT NOT NULL DEFAULT '',
      last_compacted_message_id INTEGER NOT NULL DEFAULT 0,
      last_compacted_at INTEGER, version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS context_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL,
      source_json TEXT NOT NULL, previous_memory_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending', error TEXT, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS context_backups_conversation ON context_backups(conversation_id, id);
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'expense',
      amount REAL NOT NULL,
      category TEXT,
      merchant TEXT,
      note TEXT,
      source TEXT,
      timestamp INTEGER NOT NULL,
      should_comment INTEGER NOT NULL DEFAULT 0,
      commented INTEGER NOT NULL DEFAULT 0,
      evaluation_decided INTEGER NOT NULL DEFAULT 0,
      reasons TEXT,
      conversation_id INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS diet_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_uri TEXT,
      food_name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      rating TEXT NOT NULL,
      meal_type TEXT,
      flavor TEXT,
      tags TEXT,
      note TEXT,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // 给旧版本数据库补上工具调用展示所需的元数据列。
  const transactionColumns = await db.getAllAsync('PRAGMA table_info(transactions)');
  if (!transactionColumns.some(column => column.name === 'evaluation_decided')) {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN evaluation_decided INTEGER NOT NULL DEFAULT 0');
  }

  const messageColumns = await db.getAllAsync('PRAGMA table_info(messages)');
  if (!messageColumns.some(column => column.name === 'metadata')) {
    await db.execAsync('ALTER TABLE messages ADD COLUMN metadata TEXT');
  }

  const conversationColumns = await db.getAllAsync('PRAGMA table_info(conversations)');
  if (!conversationColumns.some(column => column.name === 'character_id')) {
    await db.execAsync('ALTER TABLE conversations ADD COLUMN character_id INTEGER');
  }
  if (!conversationColumns.some(column => column.name === 'title_manual')) {
    await db.execAsync('ALTER TABLE conversations ADD COLUMN title_manual INTEGER NOT NULL DEFAULT 0');
  }
  if (!conversationColumns.some(column => column.name === 'finance_reminders_enabled')) {
    await db.execAsync('ALTER TABLE conversations ADD COLUMN finance_reminders_enabled INTEGER NOT NULL DEFAULT 0');
  }


  const characterColumns = await db.getAllAsync('PRAGMA table_info(characters)');
  if (!characterColumns.some(column => column.name === 'memory_enabled')) {
    await db.execAsync('ALTER TABLE characters ADD COLUMN memory_enabled INTEGER NOT NULL DEFAULT 1');
  }
  if (!characterColumns.some(column => column.name === 'memory_server_id')) {
    await db.execAsync("ALTER TABLE characters ADD COLUMN memory_server_id TEXT NOT NULL DEFAULT ''");
  }
}

export async function createConversation(title, financeRemindersEnabled = false, characterId = null) {
  const result = await db.runAsync(
    'INSERT INTO conversations (title, created_at, finance_reminders_enabled, character_id) VALUES (?, ?, ?, ?)',
    [title, Date.now(), financeRemindersEnabled ? 1 : 0, characterId || null]
  );
  return result.lastInsertRowId;
}

export async function createCharacter(character) {
  const result = await db.runAsync(
    `INSERT INTO characters
      (name, avatar_uri, persona, speaking_style, user_address, welcome_message, memory_enabled, memory_server_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      character.name,
      character.avatarUri || '',
      character.persona || '',
      character.speakingStyle || '',
      character.userAddress || '',
      character.welcomeMessage || '',
      character.memoryEnabled === false ? 0 : 1,
      character.memoryServerId || '',
      Date.now(),
    ]
  );
  return result.lastInsertRowId;
}

export async function loadCharacters() {
  return await db.getAllAsync('SELECT * FROM characters ORDER BY created_at DESC');
}

export async function updateCharacter(id, character) {
  await db.runAsync(
    `UPDATE characters
     SET name = ?, avatar_uri = ?, persona = ?, speaking_style = ?, user_address = ?, welcome_message = ?,
         memory_enabled = ?, memory_server_id = ?
     WHERE id = ?`,
    [
      character.name,
      character.avatarUri || '',
      character.persona || '',
      character.speakingStyle || '',
      character.userAddress || '',
      character.welcomeMessage || '',
      character.memoryEnabled === false ? 0 : 1,
      character.memoryServerId || '',
      id,
    ]
  );
}

export async function deleteCharacter(id) {
  await db.runAsync('UPDATE conversations SET character_id = NULL WHERE character_id = ?', [id]);
  await db.runAsync('DELETE FROM characters WHERE id = ?', [id]);
}

export async function updateConversationTitle(conversationId, title, manual = true) {
  await db.runAsync(
    'UPDATE conversations SET title = ?, title_manual = ? WHERE id = ?',
    [title, manual ? 1 : 0, conversationId]
  );
}

export async function setConversationFinanceEnabled(conversationId, enabled) {
  if (!conversationId) return;
  await db.runAsync(
    'UPDATE conversations SET finance_reminders_enabled = ? WHERE id = ?',
    [enabled ? 1 : 0, conversationId]
  );
}

export async function saveMessage(conversationId, role, content, metadata = null) {
  const result = await db.runAsync(
    'INSERT INTO messages (conversation_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)',
    [conversationId, role, content, metadata ? JSON.stringify(metadata) : null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function deleteMessagesFrom(conversationId, fromMessageId) {
  await db.withExclusiveTransactionAsync(async txn => {
    // A summary that contains edited/deleted history must never be reused.
    await txn.runAsync('DELETE FROM context_memories WHERE conversation_id = ? AND last_compacted_message_id >= ?', [conversationId, Number(fromMessageId)]);
    await txn.runAsync('DELETE FROM messages WHERE conversation_id = ? AND id >= ?', [conversationId, Number(fromMessageId)]);
    const row = await txn.getFirstAsync("SELECT COUNT(*) AS turn_count FROM messages WHERE conversation_id = ? AND role = 'assistant'", [conversationId]);
    await txn.runAsync(
      'INSERT INTO memory_checkpoints (conversation_id, saved_turns, updated_at) VALUES (?, ?, ?) ON CONFLICT(conversation_id) DO UPDATE SET saved_turns = excluded.saved_turns, updated_at = excluded.updated_at',
      [conversationId, row?.turn_count || 0, Date.now()]
    );
  });
}

export async function loadConversations() {
  return await db.getAllAsync('SELECT * FROM conversations ORDER BY created_at DESC');
}

export async function loadMessages(conversationId) {
  return await db.getAllAsync(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC',
    [conversationId]
  );
}

export async function loadAllMessages() {
  return await db.getAllAsync(
    'SELECT * FROM messages ORDER BY conversation_id ASC, id ASC'
  );
}



export async function saveTransaction(transaction) {
  const result = await db.runAsync(
    `INSERT INTO transactions
      (type, amount, category, merchant, note, source, timestamp, should_comment, commented, evaluation_decided, reasons, conversation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction?.type || 'expense',
      Math.abs(Number(transaction?.amount) || 0),
      transaction?.category || '',
      transaction?.merchant || '',
      transaction?.note || '',
      transaction?.source || 'unknown',
      transaction?.timestamp || Date.now(),
      transaction?.shouldComment ? 1 : 0,
      transaction?.commented ? 1 : 0,
      transaction?.evaluationDecided === false ? 0 : 1,
      JSON.stringify(transaction?.reasons || []),
      transaction?.conversationId || null,
      Date.now(),
    ]
  );
  return result.lastInsertRowId;
}

export async function markTransactionCommented(transactionId, commented = true) {
  if (!transactionId) return;
  await db.runAsync(
    'UPDATE transactions SET commented = ? WHERE id = ?',
    [commented ? 1 : 0, transactionId]
  );
}

export async function loadTransactions(limit = 200) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  return await db.getAllAsync(
    `SELECT * FROM transactions ORDER BY timestamp DESC, id DESC LIMIT ${safeLimit}`
  );
}

export async function clearTransactions() {
  await db.runAsync('DELETE FROM transactions');
}

export async function saveDietRecord(record) {
  const result = await db.runAsync(
    `INSERT INTO diet_records
      (image_uri, food_name, price, rating, meal_type, flavor, tags, note, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record?.imageUri || null,
      String(record?.foodName || '').trim(),
      Math.max(0, Number(record?.price) || 0),
      record?.rating || '',
      record?.mealType || '',
      Array.isArray(record?.flavor) ? record.flavor.filter(Boolean).join('、') : (record?.flavor || ''),
      JSON.stringify(Array.isArray(record?.tags) ? record.tags : []),
      record?.note || '',
      record?.timestamp || Date.now(),
      Date.now(),
    ]
  );
  return result.lastInsertRowId;
}

export async function loadDietRecords(limit = 500) {
  const safeLimit = Math.max(1, Math.min(2000, Number(limit) || 500));
  return await db.getAllAsync(
    `SELECT * FROM diet_records ORDER BY timestamp DESC, id DESC LIMIT ${safeLimit}`
  );
}

export async function updateDietRecord(recordId, record) {
  if (!recordId) return;
  await db.runAsync(
    `UPDATE diet_records SET
      image_uri = ?, food_name = ?, price = ?, rating = ?, meal_type = ?,
      flavor = ?, tags = ?, note = ?, timestamp = ?
     WHERE id = ?`,
    [
      record?.imageUri || null,
      String(record?.foodName || '').trim(),
      Math.max(0, Number(record?.price) || 0),
      record?.rating || '',
      record?.mealType || '',
      Array.isArray(record?.flavor) ? record.flavor.filter(Boolean).join('、') : (record?.flavor || ''),
      JSON.stringify(Array.isArray(record?.tags) ? record.tags : []),
      record?.note || '',
      record?.timestamp || Date.now(),
      recordId,
    ]
  );
}

export async function deleteDietRecord(recordId) {
  if (!recordId) return;
  await db.runAsync('DELETE FROM diet_records WHERE id = ?', [recordId]);
}

export async function deleteConversation(conversationId) {
  await db.runAsync('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
  await db.runAsync('DELETE FROM memory_checkpoints WHERE conversation_id = ?', [conversationId]);
  await clearContextMemory(conversationId);
  await db.runAsync('DELETE FROM context_backups WHERE conversation_id = ?', [conversationId]);
  await db.runAsync('DELETE FROM conversations WHERE id = ?', [conversationId]);
}

export async function loadMemoryCheckpoint(conversationId) {
  const row = await db.getFirstAsync(
    'SELECT saved_turns FROM memory_checkpoints WHERE conversation_id = ?',
    [conversationId]
  );
  return row?.saved_turns || 0;
}

export async function saveMemoryCheckpoint(conversationId, savedTurns) {
  await db.runAsync(
    `INSERT INTO memory_checkpoints (conversation_id, saved_turns, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       saved_turns = excluded.saved_turns,
       updated_at = excluded.updated_at`,
    [conversationId, savedTurns, Date.now()]
  );
}

export async function loadContextMemory(conversationId) {
  if (!conversationId) return null;
  return await db.getFirstAsync(
    'SELECT * FROM context_memories WHERE conversation_id = ?',
    [conversationId]
  );
}

async function saveContextMemory(conversationId, memory, connection = db) {
  if (!conversationId) return;
  await connection.runAsync(
    `INSERT INTO context_memories
      (conversation_id, summary, relationship_memory, user_preferences, current_state, last_compacted_message_id, last_compacted_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       summary = excluded.summary,
       relationship_memory = excluded.relationship_memory,
       user_preferences = excluded.user_preferences,
       current_state = excluded.current_state,
       last_compacted_message_id = excluded.last_compacted_message_id,
       last_compacted_at = excluded.last_compacted_at,
       version = excluded.version`,
    [
      conversationId,
      memory?.summary || '',
      memory?.relationshipMemory || '',
      memory?.userPreferences || '',
      memory?.currentState || '',
      Number(memory?.lastCompactedMessageId) || 0,
      memory?.lastCompactedAt || Date.now(),
      Number(memory?.version) || 1,
    ]
  );
}

export async function clearContextMemory(conversationId) {
  if (!conversationId) return;
  await db.runAsync('DELETE FROM context_memories WHERE conversation_id = ?', [conversationId]);
}

// Back up source rows and the previous checkpoint BEFORE sending any compaction request.
export async function createContextBackup(conversationId, sourceRows, previousMemory) {
  const result = await db.runAsync(
    'INSERT INTO context_backups (conversation_id, source_json, previous_memory_json, created_at) VALUES (?, ?, ?, ?)',
    [conversationId, JSON.stringify(sourceRows), previousMemory ? JSON.stringify(previousMemory) : null, Date.now()]
  );
  return result.lastInsertRowId;
}

export async function finishContextBackup(id, status, error = null) {
  await db.runAsync('UPDATE context_backups SET status = ?, error = ? WHERE id = ?', [status, error, id]);
}

export async function commitContextMemory(conversationId, memory, previousRow, sourceRows, backupId) {
  await db.withExclusiveTransactionAsync(async txn => {
    const current = await txn.getFirstAsync('SELECT * FROM context_memories WHERE conversation_id = ?', [conversationId]);
    const conversation = await txn.getFirstAsync('SELECT id FROM conversations WHERE id = ?', [conversationId]);
    if (!conversation || JSON.stringify(current || null) !== JSON.stringify(previousRow || null)) throw new Error('对话或摘要已改变，取消保存旧任务');
    const rows = await txn.getAllAsync('SELECT * FROM messages WHERE conversation_id = ? AND id >= ? AND id <= ? ORDER BY id ASC',
      [conversationId, sourceRows[0].id, sourceRows[sourceRows.length - 1].id]);
    if (JSON.stringify(rows) !== JSON.stringify(sourceRows)) throw new Error('原始消息已修改，取消保存旧摘要');
    await saveContextMemory(conversationId, memory, txn);
    await txn.runAsync("UPDATE context_backups SET status = 'complete', error = NULL WHERE id = ?", [backupId]);
  });
}

export async function loadContextBackups(conversationId) {
  return await db.getAllAsync('SELECT id, status, error, created_at FROM context_backups WHERE conversation_id = ? ORDER BY id DESC LIMIT 10', [conversationId]);
}

export async function loadContextExport(conversationId) {
  return {
    format: 'velorin-context-v1', exportedAt: Date.now(), conversationId,
    memory: await loadContextMemory(conversationId),
    messages: await loadMessages(conversationId),
    backups: await db.getAllAsync('SELECT * FROM context_backups WHERE conversation_id = ? ORDER BY id ASC', [conversationId]),
  };
}

