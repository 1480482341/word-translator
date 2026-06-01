/**
 * Word Translator - Popup Script
 * 扩展弹窗逻辑
 */

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const btnAdmin = document.getElementById('btnAdmin');
const btnRefresh = document.getElementById('btnRefresh');

// ── 检查后端状态 ───────────────────────────────────────

async function checkStatus() {
  statusDot.className = 'status-dot';
  statusText.textContent = '检查后端连接…';

  try {
    const response = await fetch('http://localhost:3000/api/words?page=1&limit=1');
    if (response.ok) {
      statusDot.className = 'status-dot online';
      statusText.textContent = '后端服务运行中 ✓';
    } else {
      throw new Error('HTTP ' + response.status);
    }
  } catch {
    statusDot.className = 'status-dot offline';
    statusText.textContent = '后端未连接 - 请启动服务器';
  }
}

// ── 按钮事件 ───────────────────────────────────────────

btnAdmin.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:3000/admin' });
});

btnRefresh.addEventListener('click', checkStatus);

// ── 初始化 ─────────────────────────────────────────────

checkStatus();
