/**
 * Word Translator - Service Worker
 * 负责扩展生命周期管理
 */

// 扩展安装 / 更新时
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Word Translator] 扩展已安装');
    // 可以在这里设置默认配置
    chrome.storage.local.set({
      apiBase: 'http://localhost:3000',
      enabled: true,
    });
  } else if (details.reason === 'update') {
    console.log('[Word Translator] 扩展已更新至', chrome.runtime.getManifest().version);
  }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    // 检查后端是否可达
    fetch('http://localhost:3000/api/words?page=1&limit=1')
      .then((res) => {
        sendResponse({ online: res.ok });
      })
      .catch(() => {
        sendResponse({ online: false });
      });
    return true; // 保持消息通道开启以异步响应
  }

  if (message.type === 'OPEN_ADMIN') {
    chrome.tabs.create({ url: 'http://localhost:3000/admin' });
    return false;
  }
});

console.log('[Word Translator] Service worker started');
