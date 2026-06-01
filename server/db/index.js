/**
 * Word Translator - Database Module
 * MySQL 连接池 + 自动建表 + 翻译日志 + 统计分析
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

  // 设置表（key-value 存储引擎偏好等）
  await p.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\`   VARCHAR(64)   PRIMARY KEY,
      value   TEXT          NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='系统设置表'
  `);
  console.log('[DB] 表 `settings` 已就绪');

  // 翻译日志表（用于统计引擎使用和每日/每周/每月统计）
  await p.execute(`
    CREATE TABLE IF NOT EXISTS translation_logs (
      id          INT           AUTO_INCREMENT PRIMARY KEY,
      word        VARCHAR(255)  NOT NULL COMMENT '被翻译的单词',
      engine_used VARCHAR(32)   NOT NULL COMMENT '使用的翻译引擎',
      created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_engine (engine_used)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='翻译日志表'
  `);
  console.log('[DB] 表 `translation_logs` 已就绪');
}

// ══════════════════════════════════════════════════════════════
//  Words 表操作（现有）
// ══════════════════════════════════════════════════════════════

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
 * 导出所有单词
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

// ══════════════════════════════════════════════════════════════
//  Settings 表操作
// ══════════════════════════════════════════════════════════════

/**
 * 获取设置值
 */
async function getSetting(key) {
  const p = getPool();
  const [rows] = await p.execute('SELECT value FROM settings WHERE `key` = ?', [key]);
  return rows.length > 0 ? rows[0].value : null;
}

/**
 * 保存设置值（ upsert ）
 */
async function setSetting(key, value) {
  const p = getPool();
  await p.execute(
    'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [key, value]
  );
}

// ══════════════════════════════════════════════════════════════
//  Translation Logs 表操作
// ══════════════════════════════════════════════════════════════

/**
 * 记录翻译日志
 */
async function logTranslation(word, engineUsed) {
  const p = getPool();
  await p.execute(
    'INSERT INTO translation_logs (word, engine_used) VALUES (?, ?)',
    [word, engineUsed]
  );
}

// ══════════════════════════════════════════════════════════════
//  数据分析 & 统计
// ══════════════════════════════════════════════════════════════

/**
 * 获取综合数据分析
 */
async function getAnalytics() {
  const p = getPool();

  // 总单词数
  const [[{ totalWords }]] = await p.execute('SELECT COUNT(*) AS totalWords FROM words');

  // 总翻译次数（sum of frequency）
  const [[{ totalTranslations }]] = await p.execute(
    'SELECT COALESCE(SUM(frequency), 0) AS totalTranslations FROM words'
  );

  // Top 10 高频词
  const [topWords] = await p.execute(
    'SELECT word, translation, frequency FROM words ORDER BY frequency DESC LIMIT 10'
  );

  // 最近 10 个翻译
  const [recentWords] = await p.execute(
    'SELECT word, translation, frequency, updated_at FROM words ORDER BY updated_at DESC LIMIT 10'
  );

  // 引擎使用统计
  const [engineUsage] = await p.execute(
    "SELECT engine_used AS engine, COUNT(*) AS count FROM translation_logs GROUP BY engine_used ORDER BY count DESC"
  );

  return {
    totalWords,
    totalTranslations,
    topWords,
    recentWords,
    engineUsage,
  };
}

/**
 * 每日统计 —— 最近 30 天
 */
async function getDailyStats() {
  const p = getPool();
  const [rows] = await p.execute(`
    SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS period, COUNT(*) AS count
    FROM translation_logs
    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY DATE(created_at)
    ORDER BY period ASC
  `);
  return rows;
}

/**
 * 每周统计 —— 最近 12 周
 */
async function getWeeklyStats() {
  const p = getPool();
  const [rows] = await p.execute(`
    SELECT
      CONCAT(YEAR(MIN(created_at)), '-W', LPAD(WEEK(MIN(created_at), 1), 2, '0')) AS period,
      COUNT(*) AS count
    FROM translation_logs
    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
    GROUP BY YEAR(created_at), WEEK(created_at, 1)
    ORDER BY YEAR(created_at) ASC, WEEK(created_at, 1) ASC
  `);
  return rows;
}

/**
 * 每月统计 —— 最近 12 个月
 */
async function getMonthlyStats() {
  const p = getPool();
  const [rows] = await p.execute(`
    SELECT
      DATE_FORMAT(created_at, '%Y-%m') AS period,
      COUNT(*) AS count
    FROM translation_logs
    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY period ASC
  `);
  return rows;
}

module.exports = {
  getPool,
  initDatabase,
  // words
  findWord,
  upsertWord,
  getWords,
  searchWords,
  deleteWord,
  exportAllWords,
  getWordCount,
  // settings
  getSetting,
  setSetting,
  // logs
  logTranslation,
  // analytics
  getAnalytics,
  getDailyStats,
  getWeeklyStats,
  getMonthlyStats,
};
