/**
 * Word Translator - Express Server
 * 提供翻译 API + 单词管理 API + 引擎配置 + 数据分析 + 管理后台页面
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
// ── 翻译引擎（腾讯 → 微软 → MyMemory 自动切换）─────────
const tencent = require('tencentcloud-sdk-nodejs-tmt');
const TmtClient = tencent.tmt.v20180321.Client;

const TENCENT_ID = process.env.TENCENT_SECRET_ID || '';
const TENCENT_KEY = process.env.TENCENT_SECRET_KEY || '';
const MS_KEY = process.env.MS_TRANSLATOR_KEY || '';
const MS_REGION = process.env.MS_TRANSLATOR_REGION || 'eastasia';

// 腾讯翻译
let tmtClient = null;
function getTmtClient() {
  if (tmtClient) return tmtClient;
  tmtClient = new TmtClient({
    credential: { secretId: TENCENT_ID, secretKey: TENCENT_KEY },
    region: 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'tmt.tencentcloudapi.com' } },
  });
  return tmtClient;
}

async function translateWithTencent(text) {
  const client = getTmtClient();
  const resp = await client.TextTranslate({
    SourceText: text,
    Source: 'en',
    Target: 'zh',
    ProjectId: 0,
  });
  return resp.TargetText || '';
}

// 微软翻译
async function translateWithMicrosoft(text) {
  const url = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': MS_KEY,
      'Ocp-Apim-Subscription-Region': MS_REGION,
    },
    body: JSON.stringify([{ Text: text }]),
  });
  if (!res.ok) throw new Error(`微软翻译 API 返回 ${res.status}`);
  const data = await res.json();
  return data[0]?.translations?.[0]?.text || '';
}

// MyMemory（兜底）
async function translateWithMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory API 返回 ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || '翻译失败');
  return data.responseData.translatedText;
}

/**
 * 获取用户配置的首选引擎（默认按自动顺序）
 */
async function getPreferredEngine() {
  const setting = await db.getSetting('preferred_engine');
  if (setting) return setting;
  // 自动检测可用引擎
  if (TENCENT_ID && TENCENT_KEY) return 'tencent';
  if (MS_KEY) return 'microsoft';
  return 'mymemory';
}

/**
 * 获取可用引擎列表
 */
function getAvailableEngines() {
  const engines = [
    {
      key: 'tencent',
      name: '腾讯翻译',
      configured: !!(TENCENT_ID && TENCENT_KEY),
      description: '免费 500万字符/月',
    },
    {
      key: 'microsoft',
      name: '微软翻译',
      configured: !!MS_KEY,
      description: '免费 200万字符/月',
    },
    {
      key: 'mymemory',
      name: 'MyMemory',
      configured: true, // 无需配置，总是可用
      description: '免费，无需 API Key',
    },
  ];
  return engines;
}

/**
 * 根据用户偏好和可用性执行翻译
 * 返回 { translation, engine }
 */
async function translateText(text) {
  const preferred = await getPreferredEngine();

  // 如果用户指定了首选引擎，优先尝试
  const tryOrder = [];
  if (preferred === 'tencent') tryOrder.push('tencent', 'microsoft', 'mymemory');
  else if (preferred === 'microsoft') tryOrder.push('microsoft', 'tencent', 'mymemory');
  else tryOrder.push('mymemory', 'tencent', 'microsoft');

  // 去重
  const uniqueOrder = [...new Set(tryOrder)];

  for (const engine of uniqueOrder) {
    try {
      let translation;
      if (engine === 'tencent') {
        if (!TENCENT_ID || !TENCENT_KEY) continue;
        translation = await translateWithTencent(text);
      } else if (engine === 'microsoft') {
        if (!MS_KEY) continue;
        translation = await translateWithMicrosoft(text);
      } else {
        translation = await translateWithMyMemory(text);
      }
      return { translation, engine };
    } catch (err) {
      console.warn(`[翻译] ${engine} 翻译失败，尝试下一个:`, err.message);
    }
  }

  // 所有引擎都失败了
  throw new Error('所有翻译引擎均不可用');
}

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── 中间件 ─────────────────────────────────────────────
app.use(cors());                     // 允许扩展跨域请求
app.use(express.json());            // 解析 JSON body

// ═══════════════════════════════════════════════════════
//  翻译 API
// ═══════════════════════════════════════════════════════

/**
 * POST /api/translate
 * 翻译英文文本为中文
 * Body: { text: string }
 * Response: { original, translation, word, id, frequency, engine }
 */
app.post('/api/translate', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '请提供要翻译的文本 (text)' });
    }

    const word = text.trim().toLowerCase().replace(/\s+/g, ' ');

    // 调用翻译 API（英文 → 简体中文）
    const { translation, engine } = await translateText(word);

    // 保存到数据库
    await db.upsertWord(word, translation);

    // 记录翻译日志（引擎使用情况）
    await db.logTranslation(word, engine);

    // 查询最新数据以获取 frequency
    const record = await db.findWord(word);

    console.log(`[翻译] "${word}" → "${translation}" (${engine}, 查询 ${record.frequency} 次)`);

    res.json({
      original: text.trim(),
      translation,
      word,
      id: record.id,
      frequency: record.frequency,
      engine,
    });
  } catch (err) {
    console.error('[翻译失败]', err.message);

    // 区分网络错误和翻译错误
    if (err.message && err.message.includes('429')) {
      return res.status(429).json({ error: '翻译请求过于频繁，请稍后再试' });
    }

    res.status(500).json({ error: '翻译服务暂时不可用，请稍后重试' });
  }
});

// ═══════════════════════════════════════════════════════
//  单词管理 API
// ═══════════════════════════════════════════════════════

/**
 * GET /api/words
 * 获取所有翻译记录（分页 + 可选搜索）
 * Query: ?page=1&limit=20&search=keyword
 */
app.get('/api/words', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const search = req.query.search || '';

    let result;
    if (search.trim()) {
      result = await db.searchWords(search.trim(), page, limit);
    } else {
      result = await db.getWords(page, limit);
    }

    res.json(result);
  } catch (err) {
    console.error('[查询失败]', err.message);
    res.status(500).json({ error: '查询单词列表失败' });
  }
});

/**
 * DELETE /api/words/:id
 * 删除指定单词记录
 */
app.delete('/api/words/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 ID' });
    }

    const deleted = await db.deleteWord(id);

    if (!deleted) {
      return res.status(404).json({ error: '记录不存在' });
    }

    console.log(`[删除] id=${id}`);
    res.json({ success: true, message: '已删除' });
  } catch (err) {
    console.error('[删除失败]', err.message);
    res.status(500).json({ error: '删除失败' });
  }
});

/**
 * GET /api/export
 * 导出所有单词为 CSV 文件
 */
app.get('/api/export', async (req, res) => {
  try {
    const rows = await db.exportAllWords();

    // 构建 CSV 内容（添加 BOM 以支持 Excel 正确识别 UTF-8 中文）
    const bom = '﻿';
    const header = 'ID,英文单词,中文翻译,查询次数,创建时间,更新时间\n';
    const csvRows = rows.map((r) => {
      const word = escapeCsvField(r.word);
      const translation = escapeCsvField(r.translation);
      const createdAt = formatDate(r.created_at);
      const updatedAt = formatDate(r.updated_at);
      return `${r.id},${word},${translation},${r.frequency},${createdAt},${updatedAt}`;
    });

    const csv = bom + header + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="words-export-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[导出失败]', err.message);
    res.status(500).json({ error: '导出失败' });
  }
});

/**
 * GET /api/stats
 * 获取统计数据
 */
app.get('/api/stats', async (req, res) => {
  try {
    const total = await db.getWordCount();
    res.json({ totalWords: total });
  } catch (err) {
    console.error('[统计失败]', err.message);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// ═══════════════════════════════════════════════════════
//  翻译引擎配置 API
// ═══════════════════════════════════════════════════════

/**
 * GET /api/engine
 * 返回当前激活的引擎和可用引擎列表
 */
app.get('/api/engine', async (req, res) => {
  try {
    const activeEngine = await getPreferredEngine();
    const availableEngines = getAvailableEngines();

    res.json({
      active: activeEngine,
      engines: availableEngines,
    });
  } catch (err) {
    console.error('[引擎查询失败]', err.message);
    res.status(500).json({ error: '获取引擎配置失败' });
  }
});

/**
 * PUT /api/engine
 * 设置首选翻译引擎
 * Body: { engine: "tencent" | "microsoft" | "mymemory" }
 */
app.put('/api/engine', async (req, res) => {
  try {
    const { engine } = req.body;

    if (!engine || !['tencent', 'microsoft', 'mymemory'].includes(engine)) {
      return res.status(400).json({ error: '无效的引擎类型，可选值: tencent, microsoft, mymemory' });
    }

    // 检查目标引擎是否可用
    const engines = getAvailableEngines();
    const target = engines.find((e) => e.key === engine);
    if (!target) {
      return res.status(400).json({ error: '未知引擎' });
    }
    if (!target.configured) {
      return res.status(400).json({
        error: `引擎 "${target.name}" 未配置 API Key，请先在 .env 文件中配置相关密钥`,
      });
    }

    await db.setSetting('preferred_engine', engine);
    console.log(`[引擎] 已切换为: ${target.name}`);

    res.json({
      success: true,
      active: engine,
      message: `翻译引擎已切换为 ${target.name}`,
    });
  } catch (err) {
    console.error('[引擎设置失败]', err.message);
    res.status(500).json({ error: '设置引擎失败' });
  }
});

// ═══════════════════════════════════════════════════════
//  数据分析 API
// ═══════════════════════════════════════════════════════

/**
 * GET /api/analytics
 * 返回综合数据分析
 */
app.get('/api/analytics', async (req, res) => {
  try {
    const analytics = await db.getAnalytics();

    // 补充今日翻译次数
    const p = db.getPool();
    const [[{ todayCount }]] = await p.execute(
      'SELECT COUNT(*) AS todayCount FROM translation_logs WHERE DATE(created_at) = CURDATE()'
    );
    // 本周翻译次数
    const [[{ weekCount }]] = await p.execute(`
      SELECT COUNT(*) AS weekCount FROM translation_logs
      WHERE YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
    `);

    res.json({
      ...analytics,
      todayTranslations: todayCount,
      weekTranslations: weekCount,
    });
  } catch (err) {
    console.error('[分析失败]', err.message);
    res.status(500).json({ error: '获取数据分析失败' });
  }
});

/**
 * GET /api/stats/daily
 * 最近 30 天每日翻译统计
 */
app.get('/api/stats/daily', async (req, res) => {
  try {
    const rows = await db.getDailyStats();
    res.json(rows);
  } catch (err) {
    console.error('[每日统计失败]', err.message);
    res.status(500).json({ error: '获取每日统计失败' });
  }
});

/**
 * GET /api/stats/weekly
 * 最近 12 周每周翻译统计
 */
app.get('/api/stats/weekly', async (req, res) => {
  try {
    const rows = await db.getWeeklyStats();
    res.json(rows);
  } catch (err) {
    console.error('[每周统计失败]', err.message);
    res.status(500).json({ error: '获取每周统计失败' });
  }
});

/**
 * GET /api/stats/monthly
 * 最近 12 个月每月翻译统计
 */
app.get('/api/stats/monthly', async (req, res) => {
  try {
    const rows = await db.getMonthlyStats();
    res.json(rows);
  } catch (err) {
    console.error('[每月统计失败]', err.message);
    res.status(500).json({ error: '获取每月统计失败' });
  }
});

// ── 管理后台页面 ───────────────────────────────────────

/**
 * GET /admin
 * 返回管理后台 HTML 页面
 */
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ── 静态文件 ──────────────────────────────────────────

// 服务 admin.html 同级静态资源
app.use('/admin', express.static(path.join(__dirname, 'public')));

// ── 404 处理 ──────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ── 全局错误处理 ──────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[服务器错误]', err);
  res.status(500).json({ error: '内部服务器错误' });
});

// ── 工具函数 ──────────────────────────────────────────

/**
 * 转义 CSV 字段（处理逗号、引号、换行）
 */
function escapeCsvField(value) {
  if (!value) return '""';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return `"${str}"`;
}

/**
 * 格式化日期为 YYYY-MM-DD HH:mm:ss
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── 启动服务器 ─────────────────────────────────────────

async function start() {
  try {
    // 初始化数据库
    await db.initDatabase();

    app.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║        🔤  Word Translator Server          ║');
      console.log(`║        监听端口: http://localhost:${PORT}      ║`);
      console.log(`║        管理后台: http://localhost:${PORT}/admin ║`);
      console.log('╚══════════════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('[启动失败] 无法连接数据库:', err.message);
    console.error('请确保 MySQL 已启动，并检查 .env 配置');
    process.exit(1);
  }
}

start();
