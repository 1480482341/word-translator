/**
 * Word Translator - Database Module
 * MySQL 连接池 + 自动建表
 */

const mysql = require('mysql2/promise');

let pool = null;

/**
 * 获取 MySQL 连接池（懒初始化单例）
 */
function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'word_translator',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  });

  return pool;
}

/**
 * 初始化数据库：创建数据库和表（如果不存在）
 */
async function initDatabase() {
  // 先连接到 MySQL（不指定数据库）来创建数据库
  const initConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
  });

  const dbName = process.env.DB_NAME || 'word_translator';

  await initConn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log(`[DB] 数据库 \`${dbName}\` 已就绪`);

  await initConn.end();

  // 使用连接池创建表
  const p = getPool();

  await p.execute(`
    CREATE TABLE IF NOT EXISTS words (
      id         INT           AUTO_INCREMENT PRIMARY KEY,
      word       VARCHAR(255)  NOT NULL UNIQUE COMMENT '英文单词/短语',
      translation TEXT          NOT NULL COMMENT '中文翻译',
      frequency  INT           NOT NULL DEFAULT 1 COMMENT '查询次数',
      created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_word (word),
      INDEX idx_frequency (frequency DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='翻译记录表'
  `);
  console.log('[DB] 表 `words` 已就绪');
}

/**
 * 根据单词查找记录
 */
async function findWord(word) {
  const p = getPool();
  const [rows] = await p.execute('SELECT * FROM words WHERE word = ?', [word]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * 插入或更新单词记录
 * 如果单词已存在，递增 frequency 并更新 translation
 */
async function upsertWord(word, translation) {
  const p = getPool();
  const [result] = await p.execute(
    `INSERT INTO words (word, translation, frequency)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE
       frequency = frequency + 1,
       translation = VALUES(translation)`,
    [word, translation]
  );
  return result;
}

/**
 * 获取单词列表（分页 + 按 frequency 降序）
 */
async function getWords(page = 1, limit = 20) {
  const p = getPool();
  const offset = (page - 1) * limit;

  const [rows] = await p.execute(
    'SELECT * FROM words ORDER BY frequency DESC LIMIT ? OFFSET ?',
    [String(limit), String(offset)]
  );

  const [[{ total }]] = await p.execute('SELECT COUNT(*) AS total FROM words');

  return {
    data: rows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * 搜索单词（模糊匹配）
 */
async function searchWords(keyword, page = 1, limit = 20) {
  const p = getPool();
  const offset = (page - 1) * limit;
  const pattern = `%${keyword}%`;

  const [rows] = await p.execute(
    'SELECT * FROM words WHERE word LIKE ? OR translation LIKE ? ORDER BY frequency DESC LIMIT ? OFFSET ?',
    [pattern, pattern, String(limit), String(offset)]
  );

  const [[{ total }]] = await p.execute(
    'SELECT COUNT(*) AS total FROM words WHERE word LIKE ? OR translation LIKE ?',
    [pattern, pattern]
  );

  return {
    data: rows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * 删除单词记录
 */
async function deleteWord(id) {
  const p = getPool();
  const [result] = await p.execute('DELETE FROM words WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

/**
 * 导出所有单词为 CSV 格式的数据
 */
async function exportAllWords() {
  const p = getPool();
  const [rows] = await p.execute('SELECT * FROM words ORDER BY frequency DESC');
  return rows;
}

/**
 * 获取单词总数
 */
async function getWordCount() {
  const p = getPool();
  const [[{ count }]] = await p.execute('SELECT COUNT(*) AS count FROM words');
  return count;
}

module.exports = {
  getPool,
  initDatabase,
  findWord,
  upsertWord,
  getWords,
  searchWords,
  deleteWord,
  exportAllWords,
  getWordCount,
};
