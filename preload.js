const { contextBridge, ipcRenderer } = require('electron');

// 统一构建 API 对象，便于在 contextBridge 不可用时兜底挂载
const api = {
  // ========== 文件 I/O ==========
  readJSON: (filename) => ipcRenderer.invoke('read-json', filename),
  writeJSON: (filename, data) => ipcRenderer.invoke('write-json', filename, data),
  deleteJSON: (filename) => ipcRenderer.invoke('delete-json', filename),

  // ========== 窗口控制 ==========
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChanged: (callback) => {
    ipcRenderer.on('window-maximized', (_event, isMaximized) => callback(isMaximized));
  },

  // ========== 关闭确认框（自定义模态框） ==========
  onCloseConfirmShow: (callback) => {
    ipcRenderer.on('show-close-confirm', () => callback());
  },
  closeConfirmResult: (choice) => ipcRenderer.invoke('close-confirm-result', choice),

  // ========== 图片管理 ==========
  saveImage: (imageData, filename) => ipcRenderer.invoke('save-image', imageData, filename),
  deleteImage: (relativePath) => ipcRenderer.invoke('delete-image', relativePath),

  // ========== AI ==========
  readAssetBase64: (assetUrl) => ipcRenderer.invoke('read-asset-base64', assetUrl),
  aiChat: (payload) => ipcRenderer.invoke('ai-chat', payload),
  aiTest: (config) => ipcRenderer.invoke('ai-test', config),
  aiFetchModels: (opts) => ipcRenderer.invoke('ai:fetch-models', opts),

  // ========== OCR ==========
  ocrStatus: () => ipcRenderer.invoke('ocr:status'),
  ocrStart: () => ipcRenderer.invoke('ocr:start'),
  ocrStop: () => ipcRenderer.invoke('ocr:stop'),
  ocrRecognize: (imageBase64) => ipcRenderer.invoke('ocr:recognize', imageBase64),
  ocr: (imageBase64) => ipcRenderer.invoke('ocr:recognize', imageBase64),

  // ========== TTS ==========
  ttsSpeak: (payload) => ipcRenderer.invoke('tts-speak', payload),
  ttsGetAudio: () => ipcRenderer.invoke('tts-get-audio'),
  ttsGetVoices: () => ipcRenderer.invoke('tts-get-voices'),

  // ========== OpenMAIC 课程 ==========
  openmaicStatus: () => ipcRenderer.invoke('openmaic:status'),
  openmaicInstall: () => ipcRenderer.invoke('openmaic:install'),
  openmaicStart: () => ipcRenderer.invoke('openmaic:start'),
  openmaicStop: () => ipcRenderer.invoke('openmaic:stop'),
  clearOpenmaicSession: () => ipcRenderer.invoke('clear-openmaic-session'),

  // ========== 数据备份 / 还原 ==========
  backupCreate: () => ipcRenderer.invoke('backup:create'),
  backupRestore: () => ipcRenderer.invoke('backup:restore'),
  onOpenmaicProgress: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('openmaic:progress', handler);
    return () => ipcRenderer.removeListener('openmaic:progress', handler);
  },

  // ========== 启动状态 ==========
  onSplashStatus: (callback) => {
    ipcRenderer.on('splash-status', (_event, msg) => callback(msg));
  },

  // ========== 下载设置 ==========
  downloadClearCache: () => ipcRenderer.invoke('download:clear-cache'),
  downloadGetSettings: () => ipcRenderer.invoke('download:get-settings'),
  downloadSetSettings: (settings) => ipcRenderer.invoke('download:set-settings', settings),

  // ========== 单词本（Wordbook） ==========
  wordbookLookup: (word) => ipcRenderer.invoke('wordbook:lookup', word),
  wordbookExamples: (payload) => ipcRenderer.invoke('wordbook:examples', payload),
  wordbookList: () => ipcRenderer.invoke('wordbook:list'),
  wordbookDelete: (id) => ipcRenderer.invoke('wordbook:delete', id),
  wordbookSetFavorite: (payload) => ipcRenderer.invoke('wordbook:set-favorite', payload),
  wordbookGetSettings: () => ipcRenderer.invoke('wordbook:get-settings'),
  wordbookRegisterShortcut: () => ipcRenderer.invoke('wordbook:register-shortcut'),
  wordbookOpenPopup: () => ipcRenderer.invoke('wordbook:open-popup'),
  onWordbookShortcutConflict: (callback) => {
    ipcRenderer.on('wordbook:shortcut-conflict', () => callback());
  },
};

try {
  if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
    contextBridge.exposeInMainWorld('api', api);
    console.log('[preload] window.api 已通过 contextBridge 暴露');
  } else if (typeof window !== 'undefined') {
    // 兜底：contextBridge 不可用时直接挂载（仅在 contextIsolation:false 时页面可见）
    window.api = api;
    console.warn('[preload] contextBridge 不可用，已直接挂载 window.api（兜底模式）');
  } else {
    console.error('[preload] 无法暴露 window.api：contextBridge 与 window 均不可用');
  }
} catch (e) {
  // 极端情况下（如 require('electron') 解析异常）仍尝试兜底，避免渲染进程因 window.api 缺失而崩溃
  try {
    if (typeof window !== 'undefined') window.api = api;
  } catch (_) {}
  console.error('[preload] 暴露 window.api 失败:', e && e.message);
}
