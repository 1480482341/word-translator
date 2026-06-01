/**
 * Word Translator - Content Script
 * 监听用户选中英文文本，调用后端翻译 API，在浮动面板中显示翻译结果
 */

// ── 常量 ────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000';
const PANEL_ID = 'wt-floating-panel';

// ── 浮动面板 DOM ────────────────────────────────────────

/**
 * 创建浮动翻译面板（单例）
 */
function createPanel() {
  if (document.getElementById(PANEL_ID)) {
    return document.getElementById(PANEL_ID);
  }

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="wt-panel-header">
      <span class="wt-panel-title">🔤 Word Translator</span>
      <button class="wt-panel-close" title="关闭">&times;</button>
    </div>
    <div class="wt-panel-body">
      <div class="wt-original">
        <span class="wt-label">原文:</span>
        <span class="wt-original-text"></span>
      </div>
      <div class="wt-translation">
        <span class="wt-label">翻译:</span>
        <span class="wt-translation-text"></span>
      </div>
    </div>
    <div class="wt-panel-footer">
      <span class="wt-frequency"></span>
      <span class="wt-status"></span>
    </div>
  `;

  // 关闭按钮事件
  panel.querySelector('.wt-panel-close').addEventListener('click', () => {
    hidePanel();
  });

  document.body.appendChild(panel);
  return panel;
}

/**
 * 在指定位置显示浮动面板
 */
function showPanel(x, y) {
  const panel = createPanel();
  panel.style.display = 'block';

  // 确保面板不超出视口
  const rect = panel.getBoundingClientRect();
  const panelW = rect.width || 280;
  const panelH = rect.height || 120;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let left = x + 10;
  let top = y + 10;

  if (left + panelW > viewportW - 10) {
    left = x - panelW - 10;
  }
  if (top + panelH > viewportH - 10) {
    top = y - panelH - 10;
  }
  if (left < 10) left = 10;
  if (top < 10) top = 10;

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

/**
 * 隐藏浮动面板
 */
function hidePanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) {
    panel.style.display = 'none';
    setStatus('');
    setTranslation('', '');
    setFrequency(0);
  }
}

/**
 * 设置面板中的原文和翻译
 */
function setTranslation(original, translation) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.querySelector('.wt-original-text').textContent = original;
  panel.querySelector('.wt-translation-text').textContent = translation;
}

/**
 * 设置查询频率显示
 */
function setFrequency(freq) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const el = panel.querySelector('.wt-frequency');
  el.textContent = freq > 0 ? `已查询 ${freq} 次` : '';
}

/**
 * 设置状态文字（loading / error 等）
 */
function setStatus(msg, isError = false) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const el = panel.querySelector('.wt-status');
  el.textContent = msg;
  el.className = 'wt-status' + (isError ? ' wt-error' : '');
}

// ── 文本处理 ───────────────────────────────────────────

/**
 * 判断字符是否是英文字母
 */
function isEnglishChar(ch) {
  return /^[a-zA-Z]$/.test(ch);
}

/**
 * 判断文本是否是纯英文单词/短语（允许空格、连字符、撇号）
 * 过滤掉纯数字、空字符串、中文等
 */
function isEnglishText(text) {
  if (!text || text.length < 1) return false;
  // 至少包含一个英文字母，且不包含中文字符
  return /[a-zA-Z]/.test(text) && !/[一-鿿]/.test(text);
}

/**
 * 清理选中文本：去除首尾空白，折叠多余空格
 */
function cleanSelection(text) {
  return text.trim().replace(/\s+/g, ' ');
}

// ── API 调用 ───────────────────────────────────────────

/**
 * 调用后端翻译 API
 * @param {string} text - 要翻译的文本
 * @returns {Promise<object>} - { original, translation, word, id, frequency }
 */
async function translateText(text) {
  const response = await fetch(`${API_BASE}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ── 事件处理 ───────────────────────────────────────────

/**
 * 主事件处理器：mouseup 时检测英文选中文本
 */
async function handleMouseUp(event) {
  // 忽略来自翻译面板内部的事件
  const panel = document.getElementById(PANEL_ID);
  if (panel && panel.contains(event.target)) {
    return;
  }

  // 获取选中文本
  const selection = window.getSelection();
  const rawText = selection ? selection.toString() : '';
  const text = cleanSelection(rawText);

  if (!isEnglishText(text)) {
    hidePanel();
    return;
  }

  // 单词数过多时不翻译（限制5个单词以内）
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 5) {
    return;
  }

  // 显示面板 + Loading 状态
  showPanel(event.clientX, event.clientY);
  setTranslation(text, '…');
  setStatus('正在翻译…');
  setFrequency(0);

  try {
    const result = await translateText(text);
    setTranslation(result.word || result.original, result.translation);
    setFrequency(result.frequency || 0);
    setStatus('✓');
    setTimeout(() => setStatus(''), 2000);
  } catch (err) {
    console.error('[Word Translator] 翻译失败:', err);
    setTranslation(text, '翻译失败，请检查后端服务是否启动');
    setStatus('✗ 错误', true);
  }
}

// ── 初始化 ─────────────────────────────────────────────

document.addEventListener('mouseup', handleMouseUp);

// 点击页面其他区域关闭面板
document.addEventListener('mousedown', (event) => {
  const panel = document.getElementById(PANEL_ID);
  if (panel && !panel.contains(event.target)) {
    hidePanel();
  }
});

// 按 ESC 关闭面板
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hidePanel();
  }
});

console.log('[Word Translator] Content script loaded ✓');
