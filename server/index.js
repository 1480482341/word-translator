/**
 * Word Translator - Express Server
 * 提供翻译 API + 单词管理 API + 管理后台页面
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

// 自动选择：腾讯 → 微软 → MyMemory
async function translateText(text) {
  if (TENCENT_ID && TENCENT_KEY) {
    try {
      return await translateWithTencent(text);
    } catch (err) {
      console.warn('[翻译] 腾讯翻译失败，尝试下一个:', err.message);
    }
  }
  if (MS_KEY) {
    try {
      return await translateWithMicrosoft(text);
    } catch (err) {
      console.warn('[翻译] 微软翻译失败，回退 MyMemory:', err.message);
    }
  }
  return await translateWithMyMemory(text);
}
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── 中间件 ─────────────────────────────────────────────
app.use(cors());                     // 允许扩展跨域请求
app.use(express.json());            // 解析 JSON body

// ── 路由 ───────────────────────────────────────────────

/**
 * POST /api/translate
 * 翻译英文文本为中文
 * Body: { text: string }
 * Response: { original, translation, word, id, frequency }
 */
app.post('/api/translate', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '请提供要翻译的文本 (text)' });
    }

    const word = text.trim().toLowerCase().replace(/\s+/g, ' ');

    // 调用翻译 API（英文 → 简体中文）
    const translation = await translateText(word);

    // 保存到数据库
    await db.upsertWord(word, translation);

    // 查询最新数据以获取 frequency
    const record = await db.findWord(word);

    console.log(`[翻译] "${word}" → "${translation}" (查询 ${record.frequency} 次)`);

    res.json({
      original: text.trim(),
      translation,
      word,
      id: record.id,
      frequency: record.frequency,
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
