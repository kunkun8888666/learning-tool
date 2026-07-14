const { app, BrowserWindow, ipcMain, protocol, net, Tray, Menu, nativeImage, session, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { pipeline } = require('stream/promises');

/** HTTPS Agent — 允许自签名证书（用于镜像下载源兼容性） */
const INSECURE_AGENT = new https.Agent({ rejectUnauthorized: false });

let mainWindow;
let tray = null;
/** 标记是否用户已通过托盘菜单/对话框确认退出； true 时允许真正关闭 */
let forceQuit = false;
/** 防止重复弹出关闭确认对话框 */
let isShowingCloseDialog = false;
/** 单词本查词弹窗（置顶小窗，复用） */
let wordbookPopup = null;
/** 单词本全局快捷键当前注册的加速度字符串 */
let registeredWordbookAccelerator = null;

/** 图标路径（根据 DPI 自动选择最佳尺寸） */
function getAppIconPath() {
  // 打包后 assets 在 resources/assets/（extraResources），开发时在 __dirname/assets
  const iconDir = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, 'assets');
  // 优先返回 32x32；Windows 在高清屏会自己用 256x256 缩放
  const candidate = path.join(iconDir, 'icon-32.png');
  if (fs.existsSync(candidate)) return candidate;
  const fallback = path.join(iconDir, 'icon-256.png');
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

/** 创建 nativeImage 图标 */
function getAppIconNativeImage(size) {
  const iconPath = getAppIconPath();
  if (!iconPath) return null;
  try {
    return nativeImage.createFromPath(iconPath).resize({ width: size, height: size, quality: 'best' });
  } catch (e) {
    console.error('[tray] Failed to load icon:', e.message);
    return null;
  }
}

/**
 * 数据目录策略：
 * - 开发模式：使用 __dirname/data（方便直接编辑测试数据）
 * - 打包模式：使用 userData/data（可写、独立于 asar、安装后干净无测试数据）
 */
const DATA_DIR = app.isPackaged
  ? path.join(app.getPath('userData'), 'data')
  : path.join(__dirname, 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 一次性迁移：将旧版打包在 __dirname/data 中的用户数据迁移到 userData/data
 * 仅在打包模式下、首次运行新版本时执行。
 */
function migrateOldDataIfNeeded() {
  if (!app.isPackaged) return;
  const newDataDir = DATA_DIR;
  const oldDataDir = path.join(__dirname, 'data');

  // 新目录已有数据则跳过
  if (fs.existsSync(path.join(newDataDir, 'settings.json')) ||
      fs.existsSync(path.join(newDataDir, 'user.json'))) {
    return;
  }

  // 旧目录不存在或为空则跳过
  if (!fs.existsSync(oldDataDir)) return;
  const oldFiles = fs.readdirSync(oldDataDir).filter(f => f.endsWith('.json'));
  if (oldFiles.length === 0) return;

  console.log('[migrate] 发现旧数据目录，开始迁移...');
  ensureDataDir();
  for (const file of oldFiles) {
    try {
      const src = path.join(oldDataDir, file);
      const dst = path.join(newDataDir, file);
      const content = fs.readFileSync(src, 'utf-8');
      fs.writeFileSync(dst, content, 'utf-8');
      console.log(`[migrate] 已迁移: ${file}`);
    } catch (err) {
      console.warn(`[migrate] 迁移失败: ${file} — ${err.message}`);
    }
  }
  console.log('[migrate] 迁移完成');
}

// Runtime images directory - use userData for persistent runtime storage
let IMAGES_DIR;
function getImagesDir() {
  if (!IMAGES_DIR) {
    IMAGES_DIR = path.join(app.getPath('userData'), 'images');
  }
  return IMAGES_DIR;
}
function ensureImagesDir() {
  const dir = getImagesDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Register custom protocol for serving local image assets
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-asset', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
]);

function createWindow() {
  const windowIcon = getAppIconNativeImage(256);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 540,
    frame: false,
    icon: windowIcon,                       // 任务栏/窗口图标
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      // 渲染性能优化
      backgroundThrottling: false,          // 后台不降帧
      enablePreferredSizeMode: true,        // 按需调整布局
      spellcheck: false,                    // 禁用拼写检查减少开销
    },
    title: '学习小工具',
    backgroundColor: '#f8fafc',
    show: false,
  });

  // 限制主窗口最低帧率，避免不必要的 GPU 占用
  mainWindow.webContents.setFrameRate(60);

  // 授权麦克风相关权限：听写页的「声音翻页」通过 getUserMedia 采集麦克风，需允许
  try {
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'media' || permission === 'microphone' || permission === 'audioCapture') {
        return callback(true);
      }
      callback(false);
    });
    if (typeof mainWindow.webContents.session.setPermissionCheckHandler === 'function') {
      mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission) => {
        return permission === 'media' || permission === 'microphone' || permission === 'audioCapture';
      });
    }
  } catch (_) {}

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // 通知渲染进程启动进度（渲染进程已通过 onSplashStatus 注册监听）
  mainWindow.webContents.once('did-finish-load', () => {
    try { mainWindow.webContents.send('splash-status', '正在加载界面…'); } catch (_) {}
  });

  // webview 创建时注入性能策略 + 隐藏 OpenMAIC 滚动条（动态响应）
  mainWindow.webContents.on('did-attach-webview', (_event, webContents) => {
    // 禁用后台节流，确保 webview 保持全帧率
    webContents.setBackgroundThrottling(false);
    // 移除 User-Agent 中的 Electron 标识，防止网站降级
    const ua = webContents.getUserAgent().replace(/Electron\/[\d.]+\s/, '');
    webContents.setUserAgent(ua);
    // 限制 webview 帧率，避免不必要的高刷消耗
    webContents.setFrameRate(60);
    // 允许 webview 使用自己的 GPU 渲染通道
    webContents.setZoomFactor(1);

    // 本应用只有一个 webview（OpenMAIC，partition=persist:openmaic）。向其文档注入
    // “隐藏滚动条 + 动态响应”样式：采用幂等方式插入 <style>，并在页面加载 / SPA 路由
    // 切换时重新注入，确保样式在 Next.js 客户端路由跳转后不丢失。
    const HIDE_SCROLLBAR_CSS =
      'html,body{overflow-x:hidden !important;}' +
      '*{scrollbar-width:none !important;-ms-overflow-style:none !important;}' +
      '::-webkit-scrollbar{width:0 !important;height:0 !important;display:none !important;}';
    const injectHideScrollbar = () => {
      try {
        const id = 'om-hide-scrollbar';
        const css = JSON.stringify(HIDE_SCROLLBAR_CSS);
        webContents.executeJavaScript(
          '(function(){' +
          'var s=document.getElementById(\'' + id + '\');' +
          'if(!s){s=document.createElement(\'style\');s.id=\'' + id + '\';document.head.appendChild(s);}' +
          's.textContent=' + css + ';' +
          '})();'
        ).catch(() => {});
      } catch (_) {}
    };
    webContents.on('dom-ready', injectHideScrollbar);
    webContents.on('did-finish-load', injectHideScrollbar);
    webContents.on('did-navigate-in-page', injectHideScrollbar);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 关闭窗口时：通知渲染进程弹出自定义确认框（非原生 dialog）
  mainWindow.on('close', async (event) => {
    if (forceQuit) return; // 用户已通过托盘菜单/之前对话框确认退出

    // 已有对话框打开则忽略
    if (isShowingCloseDialog) {
      event.preventDefault();
      return;
    }

    // 阻止默认关闭行为
    event.preventDefault();
    isShowingCloseDialog = true;

    // 通知渲染进程显示自定义关闭确认框
    mainWindow.webContents.send('show-close-confirm');
  });

  // 渲染进程返回用户选择
  ipcMain.handle('close-confirm-result', (_event, choice) => {
    isShowingCloseDialog = false;
    if (choice === 'minimize') {
      // 最小化到托盘
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    } else if (choice === 'quit') {
      // 关闭应用
      forceQuit = true;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    }
  });

  // 窗口关闭后清理引用
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

/**
 * 创建系统托盘图标与右键菜单
 */
function createTray() {
  if (tray) return;

  const trayIcon = getAppIconNativeImage(16) || getAppIconNativeImage(32);
  if (!trayIcon) {
    console.warn('[tray] No icon found, skip tray creation');
    return;
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('学习小工具');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开主界面',
      click: () => {
        showMainWindow();
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitApp();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // 左键单击托盘图标：显示主界面（Windows 默认行为）
  tray.on('click', () => {
    showMainWindow();
  });

  // 双击托盘图标也显示主界面
  tray.on('double-click', () => {
    showMainWindow();
  });
}

/**
 * 显示主窗口（如果已销毁则重新创建）
 */
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

/**
 * 强制关闭 OpenMAIC 相关进程（同步、可靠）
 * - 先按已追踪的子进程 PID 杀掉整棵进程树（pnpm → node → Next.js）
 * - 再以端口为兜底，杀掉任何仍占用 3000/3001 的残留进程
 * 使用 spawnSync 确保在 app.quit() 之前完成，避免“关了 App 但 OpenMAIC 残留”。
 */
function killOpenmaicProcesses() {
  const { spawnSync } = require('child_process');

  // 1) 杀掉已追踪的子进程及其整个进程树
  if (openmaicProcess && openmaicProcess.pid) {
    try {
      spawnSync('taskkill.exe', ['/F', '/T', '/PID', String(openmaicProcess.pid)], {
        windowsHide: true, stdio: 'ignore',
      });
    } catch (_) {}
  }
  openmaicProcess = null;
  openmaicPortReady = false;
  openmaicStarting = false;

  // 2) 端口兜底：杀掉任何仍监听 3000/3001 的残留进程
  try {
    const out = spawnSync('netstat', ['-ano'], { windowsHide: true, encoding: 'utf8', timeout: 5000 });
    if (out.status === 0 && out.stdout) {
      // 匹配 :3000 或 :3001（带边界，避免误杀 :30010 这类端口）
      const portRe = /:300[01](?=\s|$)/;
      const pids = new Set();
      for (const line of out.stdout.split('\n')) {
        if (line.includes('LISTENING') && portRe.test(line)) {
          const cols = line.trim().split(/\s+/);
          const pid = cols[cols.length - 1];
          if (pid && /^\d+$/.test(pid)) pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          spawnSync('taskkill.exe', ['/F', '/T', '/PID', pid], { windowsHide: true, stdio: 'ignore' });
        } catch (_) {}
      }
    }
  } catch (_) {}
}

/**
 * 彻底退出应用（强制关闭 OpenMAIC 进程）
 */
function quitApp() {
  forceQuit = true;
  killOpenmaicProcesses();

  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
}

// ============================================================
// GPU 加速策略 — 为 webview 性能调优
// ============================================================
// 核心原则：默认启用全部 GPU 加速；只有在 GPU 进程崩溃时才降级
app.commandLine.appendSwitch('--enable-gpu-rasterization');      // GPU 光栅化（离屏渲染加速）
app.commandLine.appendSwitch('--enable-zero-copy');             // 零拷贝纹理上传
app.commandLine.appendSwitch('--ignore-gpu-blocklist');         // 忽略 Chromium GPU 黑名单
app.commandLine.appendSwitch('--enable-features', 'VaapiVideoDecoder'); // 视频硬件解码

// 监听 GPU 进程崩溃 — 只有崩溃时才降级为软件渲染
app.on('gpu-process-crashed', (_event, killed) => {
  console.error('[GPU] GPU 进程崩溃 (killed=' + killed + ')，降级为软件渲染');
  // 标记：下次创建 webview 或新窗口时不再依赖 GPU
  process.env.ELECTRON_GPU_DISABLED = '1';
});

// 如果之前已标记 GPU 不可用，则使用软件渲染
if (process.env.ELECTRON_GPU_DISABLED === '1') {
  console.log('[GPU] 上次 GPU 崩溃，本次使用软件渲染');
  app.commandLine.appendSwitch('--disable-gpu');
  app.commandLine.appendSwitch('--disable-gpu-compositing');
}

// 全局异常处理，防止未捕获异常导致整个 Electron 进程崩溃
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

// ============================================================
// 性能优化：V8 代码缓存 + 内存限制
// ============================================================
// 启用 V8 代码缓存，加速二次启动时 JS 解析
app.commandLine.appendSwitch('--js-flags', '--max-old-space-size=512');
// 启用站点隔离（安全性）但限制子进程数
app.commandLine.appendSwitch('--disable-renderer-backgrounding');

/**
 * 首次运行检测 — 打包后首次启动时清理 OpenMAIC cookie 和会话数据
 * 通过 userData 目录下的 .first-run 标记文件判断是否首次运行
 */
function clearOpenmaicSessionOnFirstRun() {
  const flagFile = path.join(app.getPath('userData'), '.first-run-complete');

  if (fs.existsSync(flagFile)) {
    return; // 不是首次运行
  }

  console.log('[first-run] 首次运行，清理 OpenMAIC 会话数据...');

  // 清理 persist:openmaic 分区的所有数据（cookie、cache、storage）
  const openmaicSession = session.fromPartition('persist:openmaic');
  openmaicSession.clearStorageData({
    storages: ['cookies', 'filesystem', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'],
  }).then(() => {
    console.log('[first-run] OpenMAIC storage 已清理');
  }).catch(err => {
    console.warn('[first-run] 清理 storage 失败:', err.message);
  });

  openmaicSession.clearCache().then(() => {
    console.log('[first-run] OpenMAIC cache 已清理');
  }).catch(err => {
    console.warn('[first-run] 清理 cache 失败:', err.message);
  });

  // 清理默认会话的 cookie 和缓存（防止开发数据残留）
  session.defaultSession.clearStorageData({
    storages: ['cookies', 'filesystem', 'websql', 'serviceworkers', 'cachestorage'],
  }).catch(err => {
    console.warn('[first-run] 清理默认 session 失败:', err.message);
  });

  session.defaultSession.clearCache().catch(err => {
    console.warn('[first-run] 清理默认 cache 失败:', err.message);
  });

  // 清理 OpenMAIC 运行时数据目录（userData/openmaic 下的 .next 缓存等）
  const openmaicDir = path.join(app.getPath('userData'), 'openmaic');
  if (fs.existsSync(openmaicDir)) {
    const nextDir = path.join(openmaicDir, '.next');
    if (fs.existsSync(nextDir)) {
      try {
        fs.rmSync(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        console.log('[first-run] OpenMAIC .next 缓存已清理');
      } catch (err) {
        console.warn('[first-run] 清理 .next 失败:', err.message);
      }
    }
  }

  // 写入标记文件，后续启动不再清理
  try {
    fs.writeFileSync(flagFile, new Date().toISOString(), 'utf-8');
  } catch (err) {
    console.warn('[first-run] 无法写入标记文件:', err.message);
  }
}

app.whenReady().then(() => {
  // 迁移旧版数据（打包模式）
  migrateOldDataIfNeeded();

  ensureDataDir();
  ensureImagesDir();

  // 首次运行时清理 OpenMAIC 会话数据
  clearOpenmaicSessionOnFirstRun();

  // Handle local-asset:// protocol — serves files from userData directory
  protocol.handle('local-asset', (request) => {
    const url = new URL(request.url);
    // local-asset://images/filename.jpg → hostname='images', pathname='/filename.jpg'
    const filePath = path.join(app.getPath('userData'), url.hostname, url.pathname);
    return net.fetch('file:///' + filePath.replace(/\\/g, '/'));
  });

  createWindow();

  // 创建系统托盘图标（驻留）
  createTray();

  // 注册单词本全局快捷键（依据设置中的 enabled / shortcut）
  registerWordbookShortcut();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Windows/Linux：窗口全部关闭后退出应用。
  // 若用户选择"最小化到托盘"，窗口只是 hide() 而非 close()，
  // 因此此事件仅在真正关闭时触发。
  // 退出前注销全局快捷键，避免占用
  try { if (registeredWordbookAccelerator) globalShortcut.unregister(registeredWordbookAccelerator); } catch (_) {}
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================
// IPC Handlers - File I/O for JSON data
// ============================================================

ipcMain.handle('read-json', async (_event, filename) => {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err.message);
    return null;
  }
});

ipcMain.handle('write-json', async (_event, filename, data) => {
  try {
    const filePath = path.join(DATA_DIR, filename);
    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    console.error(`Error writing ${filename}:`, err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-json', async (_event, filename) => {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true };
  } catch (err) {
    console.error(`Error deleting ${filename}:`, err.message);
    return { success: false, error: err.message };
  }
});

// ============================================================
// IPC Handlers - Image I/O for exam paper images
// ============================================================

ipcMain.handle('save-image', async (_event, imageData, filename) => {
  try {
    ensureImagesDir();
    // Strip base64 data URL prefix if present
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const imgDir = getImagesDir();
    fs.writeFileSync(path.join(imgDir, filename), buffer);
    // Return a local-asset:// URL for direct use in img tags
    const assetUrl = `local-asset://images/${filename}`;
    return { success: true, path: assetUrl };
  } catch (err) {
    console.error('Error saving image:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-image', async (_event, assetUrl) => {
  try {
    // assetUrl is like "local-asset://images/filename.jpg"
    const relativePath = assetUrl.replace('local-asset://', '');
    const filePath = path.join(app.getPath('userData'), relativePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (err) {
    console.error('Error deleting image:', err.message);
    return { success: false, error: err.message };
  }
});

// ============================================================
// IPC Handlers - Window Controls (frameless)
// ============================================================

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // 通过 IPC 触发关闭时，同样走主窗口的 'close' 事件确认流程
  // 这里手动触发 close 事件，或调用 close() 都会进入 'close' handler
  mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// Notify renderer when maximize state changes
app.on('browser-window-created', (_, window) => {
  window.on('maximize', () => {
    window.webContents.send('window-maximized', true);
  });
  window.on('unmaximize', () => {
    window.webContents.send('window-maximized', false);
  });
});

// ============================================================
// IPC Handlers - Download Settings
// ============================================================

ipcMain.handle('download:clear-cache', async () => {
  try {
    // 只清理缓存目录，不删除工作目录或工具安装！
    const cacheDirs = [
      path.join(OPENMAIC_DIR(), '.next'),                     // Next.js 构建缓存
      path.join(process.env.APPDATA || '', 'npm-cache'),      // npm 缓存
      path.join(app.getPath('userData'), 'Cache'),            // Electron 缓存
      path.join(app.getPath('userData'), 'GPUCache'),         // GPU 缓存
    ];
    
    let clearedSize = 0;
    for (const dir of cacheDirs) {
      if (fs.existsSync(dir)) {
        const stats = fs.statSync(dir);
        if (stats.isDirectory()) {
          const getDirSize = (d) => {
            let size = 0;
            const items = fs.readdirSync(d);
            for (const item of items) {
              const fullPath = path.join(d, item);
              const s = fs.statSync(fullPath);
              if (s.isDirectory()) size += getDirSize(fullPath);
              else size += s.size;
            }
            return size;
          };
          clearedSize += getDirSize(dir);
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    }
    
    return { 
      success: true, 
      clearedSize: clearedSize,
      clearedSizeFormatted: `${(clearedSize / 1024 / 1024).toFixed(2)} MB`
    };
  } catch (err) {
    console.error('Clear cache error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download:get-settings', async () => {
  try {
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      return {
        speedLimit: 0,
        threads: 4,
        source: 'ghproxy',
        customSource: 'https://gh-proxy.com'
      };
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return {
      speedLimit: settings.downloadSpeedLimit || 0,
      threads: settings.downloadThreads || 4,
      source: settings.downloadSource || 'ghproxy',
      customSource: settings.downloadCustomSource || 'https://gh-proxy.com'
    };
  } catch (err) {
    console.error('Get download settings error:', err.message);
    return {
      speedLimit: 0,
      threads: 4,
      source: 'ghproxy',
      customSource: 'https://gh-proxy.com'
    };
  }
});

ipcMain.handle('download:set-settings', async (_event, settings) => {
  try {
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    let currentSettings = {};
    if (fs.existsSync(settingsPath)) {
      currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
    currentSettings.downloadSpeedLimit = settings.speedLimit;
    currentSettings.downloadThreads = settings.threads;
    currentSettings.downloadSource = settings.source;
    currentSettings.downloadCustomSource = settings.customSource;
    fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    console.error('Set download settings error:', err.message);
    return { success: false, error: err.message };
  }
});

// ============================================================
// IPC Handlers - 读取 local-asset 图片为 base64
// ============================================================

ipcMain.handle('read-asset-base64', async (_event, assetUrl) => {
  try {
    if (!assetUrl || !assetUrl.startsWith('local-asset://')) {
      return { success: false, error: 'invalid asset url' };
    }
    const relativePath = assetUrl.replace('local-asset://', '');
    const filePath = path.join(app.getPath('userData'), relativePath);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'file not found' };
    }
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimeMap = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp', bmp: 'bmp' };
    const mime = `image/${mimeMap[ext] || ext || 'jpeg'}`;
    return { success: true, base64: buffer.toString('base64'), mime };
  } catch (err) {
    console.error('Error reading asset:', err.message);
    return { success: false, error: err.message };
  }
});

// ============================================================
// IPC Handlers - AI Chat (OpenAI / Gemini 代理)
// ============================================================

/**
 * 调用 OpenAI 兼容的 Chat Completions API
 */
async function callOpenAI(config, messages, options = {}) {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: config.model || 'gpt-4o',
    messages,
    max_tokens: options.maxTokens || 2000,
    temperature: options.temperature ?? 0.7,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try { detail = JSON.parse(text).error?.message || text; } catch (_) {}
    throw new Error(`OpenAI ${res.status}: ${detail}`);
  }
  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content || '';
}

/**
 * 调用 Google Gemini generateContent API（兼容官方与中转站）
 * baseUrl 默认官方地址：https://generativelanguage.googleapis.com/v1beta
 * 中转站用法：把 baseUrl 改成中转站对应的 /v1beta 路径即可
 */
async function callGemini(config, messages, options = {}) {
  const defaultBase = 'https://generativelanguage.googleapis.com/v1beta';
  const baseUrl = (config.baseUrl || defaultBase).replace(/\/+$/, '');
  const model = config.model || 'gemini-1.5-flash';
  // 智能拼接：baseUrl 已包含 /v1beta 时不再重复添加
  const hasV1Beta = /\/v1(beta)?$/.test(baseUrl);
  const modelsSegment = hasV1Beta ? '/models' : '/v1beta/models';
  const url = `${baseUrl}${modelsSegment}${model.startsWith('/') ? model : '/' + model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  // 转换 messages -> Gemini contents
  // 简单实现：合并 system + user 消息到 contents[0].parts
  const systemText = messages.filter(m => m.role === 'system').map(m => extractText(m)).join('\n\n');
  const contents = [];
  let firstUserHandled = false;
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') {
      const parts = [];
      if (!firstUserHandled && systemText) {
        parts.push({ text: systemText + '\n\n' });
        firstUserHandled = true;
      }
      if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === 'text') parts.push({ text: part.text });
          else if (part.type === 'image_url' && part.image_url?.url) {
            const m2 = part.image_url.url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
            if (m2) parts.push({ inline_data: { mime_type: m2[1], data: m2[2] } });
          }
        }
      } else if (typeof m.content === 'string') {
        parts.push({ text: m.content });
      }
      if (parts.length > 0) contents.push({ role: 'user', parts });
    } else if (m.role === 'assistant') {
      const t = extractText(m);
      if (t) contents.push({ role: 'model', parts: [{ text: t }] });
    }
  }
  // 如果没有 user part 但有 system，建一个空的 user 来避免错误
  if (contents.length === 0 && systemText) {
    contents.push({ role: 'user', parts: [{ text: systemText }] });
  }

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens || 2000,
      temperature: options.temperature ?? 0.7,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try { detail = JSON.parse(text).error?.message || text; } catch (_) {}
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }
  const data = JSON.parse(text);
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
}

function extractText(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.filter(p => p.type === 'text').map(p => p.text).join('\n');
  }
  return '';
}

function isImageNotSupportedError(errMsg) {
  const patterns = [
    /image.*not.*support/i,
    /此模型不支持图片/i,
    /unsupported.*media.*type/i,
    /content.*not.*allowed/i,
    /image.*is.*not.*supported/i,
    /vision.*capabilities/i,
    /does.*not.*support.*image/i,
    /cannot.*process.*image/i,
  ];
  return patterns.some(p => p.test(errMsg));
}

async function ocrImage(imageBase64) {
  const result = await recognizeOCR(imageBase64);
  return result.success ? result.text : null;
}

async function replaceImagesWithOCR(messages) {
  const newMessages = [];
  for (const msg of messages) {
    if (msg.role !== 'user') {
      newMessages.push(msg);
      continue;
    }
    
    if (typeof msg.content === 'string') {
      newMessages.push(msg);
      continue;
    }
    
    if (Array.isArray(msg.content)) {
      const newContent = [];
      for (const part of msg.content) {
        if (part.type === 'image_url' && part.image_url?.url) {
          const m = part.image_url.url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (m) {
            const ocrText = await ocrImage(m[2]);
            if (ocrText) {
              newContent.push({ type: 'text', text: `【图片内容】\n${ocrText}` });
            }
          }
        } else {
          newContent.push(part);
        }
      }
      newMessages.push({ role: msg.role, content: newContent });
    } else {
      newMessages.push(msg);
    }
  }
  return newMessages;
}

ipcMain.handle('ai-chat', async (_event, payload) => {
  try {
    const { config, messages, options } = payload || {};
    if (!config || !config.apiKey) {
      return { success: false, error: '未配置 API Key' };
    }
    
    let hasImages = messages.some(m => 
      m.role === 'user' && 
      Array.isArray(m.content) && 
      m.content.some(p => p.type === 'image_url')
    );
    
    let content;
    let attempt = 0;
    const maxAttempts = hasImages ? 2 : 1;
    
    while (attempt < maxAttempts) {
      attempt++;
      try {
        if (config.type === 'gemini') {
          content = await callGemini(config, messages, options || {});
        } else {
          content = await callOpenAI(config, messages, options || {});
        }
        return { success: true, content };
      } catch (err) {
        console.error('AI chat error:', err.message);
        if (attempt < maxAttempts && isImageNotSupportedError(err.message)) {
          console.log('[ai-chat] Image not supported, trying OCR fallback...');
          const ocrMessages = await replaceImagesWithOCR(messages);
          messages.splice(0, messages.length, ...ocrMessages);
        } else {
          return { success: false, error: err.message };
        }
      }
    }
    return { success: false, error: '重试失败' };
  } catch (err) {
    console.error('AI chat error:', err.message);
    return { success: false, error: err.message };
  }
});

let ttsAudioBuffer = null;
const TTS_API_URL = 'https://tts.235790.xyz/v1/audio/speech';
/** TTS 缓冲区最大保留时间 (ms)，超时自动清理 */
const TTS_BUFFER_TTL = 120000;
let ttsBufferTimer = null;

function clearTtsBuffer() {
  ttsAudioBuffer = null;
  if (ttsBufferTimer) {
    clearTimeout(ttsBufferTimer);
    ttsBufferTimer = null;
  }
}

ipcMain.handle('tts-speak', async (_event, payload) => {
  try {
    const { text, rate = 0.8, voice = 'zh-CN-XiaoxiaoNeural' } = payload;
    const res = await fetch(TTS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        voice: voice,
        speed: rate,
        pitch: '0',
        style: 'general'
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      return { success: false, error: `TTS server returned ${res.status}` };
    }
    const audioBuffer = Buffer.from(await res.arrayBuffer());
    // 先清理旧缓冲区再赋值新的
    clearTtsBuffer();
    ttsAudioBuffer = audioBuffer;
    // 设置定时器：超时自动清理
    ttsBufferTimer = setTimeout(() => {
      ttsAudioBuffer = null;
      ttsBufferTimer = null;
    }, TTS_BUFFER_TTL);
    // 直接把音频(base64)随返回值带回，避免与 tts-get-audio 共用全局缓冲
    // 导致多次朗读并发时取到别人的音频、读错单词。
    return { success: true, length: audioBuffer.length, audio: audioBuffer.toString('base64') };
  } catch (err) {
    console.warn('TTS error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tts-get-audio', () => {
  if (ttsAudioBuffer) {
    return { success: true, audio: ttsAudioBuffer.toString('base64') };
  }
  return { success: false, error: 'No audio available' };
});

ipcMain.handle('tts-get-voices', async () => {
  // 该 TTS 服务支持的中文语音列表
  const voices = [
    { name: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaoyiNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaochenNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaohanNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaomengNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaomoNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaoqiuNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaoruiNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaoshuangNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaoxuanNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaoyanNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaoyouNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-XiaozhenNeural', locale: 'zh-CN', gender: 'Female' },
    { name: 'zh-CN-YunxiNeural', locale: 'zh-CN', gender: 'Male' },
    { name: 'zh-CN-YunyangNeural', locale: 'zh-CN', gender: 'Male' },
    { name: 'zh-CN-YunjianNeural', locale: 'zh-CN', gender: 'Male' },
    { name: 'zh-CN-YunfengNeural', locale: 'zh-CN', gender: 'Male' },
    { name: 'zh-CN-YunhaoNeural', locale: 'zh-CN', gender: 'Male' },
    { name: 'zh-CN-YunxiaNeural', locale: 'zh-CN', gender: 'Male' },
    { name: 'zh-CN-YunyeNeural', locale: 'zh-CN', gender: 'Male' },
    { name: 'zh-CN-YunzeNeural', locale: 'zh-CN', gender: 'Male' },
  ];
  return { success: true, voices };
});

/**
 * 测试 AI 可用性 - 用最小请求（max_tokens=1, "Hi"）
 * @param {Object} config
 * @returns {Promise<{success: boolean, status?: string, latencyMs?: number, error?: string}>}
 */
ipcMain.handle('ai-test', async (_event, config) => {
  const start = Date.now();
  try {
    if (!config || !config.apiKey) {
      return { success: false, status: 'no_key', error: '未配置 API Key' };
    }
    const testMessages = [
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] }
    ];
    let content;
    if (config.type === 'gemini') {
      content = await callGemini(config, testMessages, { maxTokens: 1, temperature: 0 });
    } else {
      content = await callOpenAI(config, testMessages, { maxTokens: 1, temperature: 0 });
    }
    return {
      success: true,
      status: 'ok',
      latencyMs: Date.now() - start,
      preview: (content || '').slice(0, 50),
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    // 解析错误码
    const m = String(err.message || '').match(/(OpenAI|Gemini)\s+(\d{3})/);
    const code = m ? m[2] : '';
    let status = 'unknown';
    if (code === '401' || code === '403') status = 'auth';
    else if (code === '404' || code === '400') status = 'notfound';
    else if (code === '429') status = 'ratelimit';
    else if (code === '5' + '00' || code === '502' || code === '503' || code === '504') status = 'server';
    else if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|abort/i.test(err.message || '')) status = 'network';
    return { success: false, status, code, latencyMs, error: err.message };
  }
});

/** 查询 OpenAI 兼容 API 的可用模型列表 */
ipcMain.handle('ai:fetch-models', async (_event, { baseUrl, apiKey }) => {
  try {
    const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/models';
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { success: false, error: `请求失败 (${res.status})` };
    }

    const data = await res.json();
    // OpenAI /v1/models 返回 { data: [{ id, ... }] }
    const models = Array.isArray(data.data)
      ? data.data.map(m => m.id || '').filter(Boolean).sort()
      : [];
    if (models.length === 0) {
      return { success: false, error: '未获取到可用模型列表' };
    }
    return { success: true, models };
  } catch (e) {
    if (e.name === 'TimeoutError') return { success: false, error: '查询超时（10s）' };
    return { success: false, error: e.message };
  }
});



// ============================================================
// OpenMAIC 课程系统（参考官方安装方式：https://openmaic.io/zh/）
// ============================================================
// 官方安装步骤：
// 1. git clone https://github.com/THU-MAIC/OpenMAIC.git
// 2. cd OpenMAIC && pnpm install
// 3. cp .env.example .env.local (添加 API 密钥)
// 4. pnpm dev (http://localhost:3000)

const OPENMAIC_DIR = () => path.join(app.getPath('userData'), 'openmaic');
const TOOLS_DIR = () => path.join(app.getPath('userData'), 'tools');
const OPENMAIC_REPO_URL = 'https://github.com/THU-MAIC/OpenMAIC.git';

// ============================================================
// OpenMAIC 数据隐私策略
// ============================================================
// OpenMAIC 的源码仓库从 GitHub 拉取，但以下数据**始终保存在本地**，
// 不会进行任何远程同步、上传或云备份：
//   1. 用户设置 (data/settings.json)
//   2. 成绩/用户信息 (data/*.json)
//   3. 试卷图片 (local-asset://images/*, 位于 userData/images)
//   4. OpenMAIC 本地运行配置 (.env.local，仅写入 API key 供本地服务使用)
//   5. 本地构建缓存 (.next/ 目录) 仅在本地磁盘
// ============================================================

const NODE_LTS_VERSION = 'v22.22.2';
const NODE_DOWNLOAD_URL = `https://nodejs.org/dist/${NODE_LTS_VERSION}/node-${NODE_LTS_VERSION}-win-x64.zip`;

const MINGIT_VERSION = '2.55.0';
const MINGIT_DOWNLOAD_URL = `https://github.com/git-for-windows/git/releases/download/v${MINGIT_VERSION}.windows.1/MinGit-${MINGIT_VERSION}-64-bit.zip`;

const GIT_PROXY_URL = 'https://gh-proxy.org';
const NODE_MIRROR_URL = 'https://mirrors.tuna.tsinghua.edu.cn/nodejs-release';

let openmaicProcess = null;
let openmaicPortReady = false;
let openmaicActualPort = 3000;  // 实际端口（Next.js 可能自动 +1）
let openmaicStarting = false;  // 防止重复启动

function isOpenmaicInstalled() {
  const baseDir = OPENMAIC_DIR();
  // 不仅检查 package.json 存在，还要验证工作包子包已正确构建
  if (!fs.existsSync(path.join(baseDir, 'package.json'))) return false;
  // 关键子包的 dist 目录不存在说明之前的 pnpm install 构建失败
  const dslDist = path.join(baseDir, 'packages/@openmaic/dsl/dist');
  if (!fs.existsSync(dslDist)) {
    console.log('[openmaic] Installation detected as broken (missing dsl/dist), will re-install.');
    return false;
  }
  return true;
}

async function isOpenmaicPortReady() {
  // Next.js 可能使用 3000 或 3001（端口被占用时自动 +1）
  for (const port of [3000, 3001]) {
    try {
      const res = await fetch(`http://localhost:${port}`, { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status < 500) return true;
    } catch (_) {}
  }
  return false;
}

function emitOpenmaicProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('openmaic:progress', data);
  }
}

async function spawnAsync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { ...opts, windowsHide: true, shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', d => stdout += d.toString());
    proc.stderr?.on('data', d => stderr += d.toString());
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Process exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function findGit() {
  const portableGit = path.join(TOOLS_DIR(), 'git', 'cmd', 'git.exe');
  if (fs.existsSync(portableGit)) return portableGit;
  const candidates = ['git'];
  if (process.platform === 'win32') {
    candidates.push('C:\Program Files\Git\cmd\git.exe', 'C:\Program Files (x86)\Git\cmd\git.exe');
  }
  for (const cmd of candidates) {
    try {
      await spawnAsync(cmd, ['--version'], { timeout: 5000 });
      return cmd;
    } catch (_) {}
  }
  return null;
}

async function findNode() {
  const portableNode = path.join(TOOLS_DIR(), 'node', 'node.exe');
  if (fs.existsSync(portableNode)) return portableNode;
  const candidates = ['node'];
  if (process.platform === 'win32') {
    candidates.push('C:\Program Files\nodejs\node.exe');
  }
  for (const cmd of candidates) {
    try {
      await spawnAsync(cmd, ['--version'], { timeout: 5000 });
      return cmd;
    } catch (_) {}
  }
  return null;
}

async function findPnpm() {
  const nodeDir = path.join(TOOLS_DIR(), 'node');
  const portablePnpm = path.join(nodeDir, 'pnpm.cmd');
  if (fs.existsSync(portablePnpm)) return portablePnpm;

  const candidates = ['pnpm', 'pnpm.cmd'];
  if (process.platform === 'win32') {
    candidates.push(
      path.join(process.env.APPDATA || '', 'pnpm', 'pnpm.cmd'),
      path.join(process.env.APPDATA || '', 'npm', 'pnpm.cmd'),
      'C:\Program Files\nodejs\pnpm.cmd',
    );
  }
  for (const cmd of candidates) {
    try {
      await spawnAsync(cmd, ['--version'], { timeout: 5000 });
      return cmd;
    } catch (_) {}
  }
  const nodeCmd = await findNode();
  if (nodeCmd) {
    const corepackPath = path.join(path.dirname(nodeCmd), 'corepack.cmd');
    if (fs.existsSync(corepackPath)) {
      try {
        await spawnAsync(corepackPath, ['pnpm', '--version'], { timeout: 10000 });
        return { node: nodeCmd, viaCorepack: true };
      } catch (_) {}
    }
  }
  return null;
}

async function getDownloadSettings() {
  try {
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      return {
        speedLimit: 0,
        threads: 4,
        source: 'ghproxy',
        customSource: 'https://gh-proxy.org'
      };
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return {
      speedLimit: settings.downloadSpeedLimit || 0,
      threads: settings.downloadThreads || 4,
      source: settings.downloadSource || 'ghproxy',
      customSource: settings.downloadCustomSource || 'https://gh-proxy.org'
    };
  } catch (err) {
    return {
      speedLimit: 0,
      threads: 4,
      source: 'ghproxy',
      customSource: 'https://gh-proxy.org'
    };
  }
}

function getEffectiveProxyUrl() {
  const settingsPath = path.join(DATA_DIR, 'settings.json');
  if (!fs.existsSync(settingsPath)) return 'https://gh-proxy.org';
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const source = settings.downloadSource || 'ghproxy';
    if (source === 'original') return '';
    if (source === 'custom') return settings.downloadCustomSource || 'https://gh-proxy.org';
    return 'https://gh-proxy.org';
  } catch (_) {
    return 'https://gh-proxy.org';
  }
}

function buildMirrorUrl(originalUrl) {
  const proxy = getEffectiveProxyUrl();
  if (!proxy) return originalUrl;
  return `${proxy}/${originalUrl}`;
}

function downloadFileWithMirror(url, destPath, mirrors, onProgress) {
  return new Promise((resolve, reject) => {
    let currentUrl = url;
    let mirrorIndex = 0;

    function tryDownload(u) {
      const mod = u.startsWith('https') ? https : http;
      const file = fs.createWriteStream(destPath);
      mod.get(u, { agent: INSECURE_AGENT }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          try { fs.unlinkSync(destPath); } catch (_) {}
          return tryDownload(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(destPath); } catch (_) {}
          if (mirrorIndex < mirrors.length) {
            currentUrl = mirrors[mirrorIndex++];
            console.log(`[openmaic] fallback to mirror: ${currentUrl}`);
            return tryDownload(currentUrl);
          }
          return reject(new Error(`下载失败: HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress && total) onProgress(downloaded, total);
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(destPath); });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch (_) {}
        if (mirrorIndex < mirrors.length) {
          currentUrl = mirrors[mirrorIndex++];
          console.log(`[openmaic] network error, fallback to mirror: ${currentUrl}`);
          return tryDownload(currentUrl);
        }
        reject(err);
      });
    }
    tryDownload(currentUrl);
  });
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const psCmd = `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`;
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `解压失败 (exit code ${code})`));
    });
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function removeDirWithRetry(dir, maxRetries = 5, delayMs = 1000) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    
    async function attemptRemove() {
      try {
        if (!fs.existsSync(dir)) {
          resolve();
          return;
        }
        
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
          console.log(`[openmaic] Successfully removed ${dir} via fs.rmSync`);
          resolve();
          return;
        } catch (fsErr) {
          console.warn(`[openmaic] fs.rmSync failed: ${fsErr.message}`);
        }
        
        if (retries === 0) {
          try {
            await new Promise(resolve => {
              const proc = require('child_process').spawn('taskkill.exe', ['/F', '/IM', 'git.exe'], { shell: false });
              proc.on('close', () => setTimeout(resolve, 1000));
            });
            console.log(`[openmaic] Killed git.exe processes`);
          } catch (_) {}
        }
        
        const args = ['-Command', `Remove-Item -LiteralPath "${dir}" -Recurse -Force`];
        const proc = require('child_process').spawn('powershell.exe', args, { shell: true });
        
        let output = '';
        proc.stdout?.on('data', d => output += d.toString());
        proc.stderr?.on('data', d => output += d.toString());
        
        proc.on('close', (code) => {
          if (!fs.existsSync(dir)) {
            console.log(`[openmaic] Successfully removed ${dir}`);
            resolve();
          } else {
            console.warn(`[openmaic] Remove failed with code ${code}, output: ${output.trim()}`);
            if (retries < maxRetries) {
              retries++;
              console.warn(`[openmaic] Retrying ${retries}/${maxRetries}...`);
              setTimeout(attemptRemove, delayMs * retries);
            } else {
              console.error(`[openmaic] Failed to remove ${dir} after ${maxRetries} retries`);
              reject(new Error(`无法删除目录: ${dir}`));
            }
          }
        });
        
        proc.on('error', (err) => {
          if (retries < maxRetries) {
            retries++;
            console.warn(`[openmaic] Error: ${err.message}, retrying ${retries}/${maxRetries}...`);
            setTimeout(attemptRemove, delayMs * retries);
          } else {
            reject(err);
          }
        });
        
      } catch (err) {
        if (retries < maxRetries) {
          retries++;
          console.warn(`[openmaic] Error: ${err.message}, retrying ${retries}/${maxRetries}...`);
          setTimeout(attemptRemove, delayMs * retries);
        } else {
          reject(err);
        }
      }
    }
    
    attemptRemove();
  });
}

async function ensureGit() {
  let gitCmd = await findGit();
  if (gitCmd) return gitCmd;

  emitOpenmaicProgress({ step: 'deps_git', label: '正在下载 Git 便携版…', pct: 2 });
  const toolsDir = TOOLS_DIR();
  ensureDir(toolsDir);
  const zipPath = path.join(toolsDir, 'mingit.zip');
  
  const proxyUrl = getEffectiveProxyUrl();
  const gitMirrors = [
    proxyUrl ? `${proxyUrl}/${MINGIT_DOWNLOAD_URL}` : MINGIT_DOWNLOAD_URL,
    MINGIT_DOWNLOAD_URL,
  ];

  try {
    await downloadFileWithMirror(proxyUrl ? `${proxyUrl}/${MINGIT_DOWNLOAD_URL}` : MINGIT_DOWNLOAD_URL, zipPath, gitMirrors, (done, total) => {
      emitOpenmaicProgress({ step: 'deps_git', label: `下载 Git: ${(done / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`, pct: 2 + (done / total) * 5 });
    });
    emitOpenmaicProgress({ step: 'deps_git', label: '正在解压 Git…', pct: 7 });
    await extractZip(zipPath, path.join(toolsDir, 'git'));
    try { fs.unlinkSync(zipPath); } catch (_) {}
    gitCmd = await findGit();
    if (!gitCmd) throw new Error('Git 安装后仍无法找到 git 命令');
    return gitCmd;
  } catch (err) {
    try { fs.unlinkSync(zipPath); } catch (_) {}
    throw new Error(`Git 自动安装失败: ${err.message}`);
  }
}

async function ensureNode() {
  let nodeCmd = await findNode();
  if (nodeCmd) return nodeCmd;

  emitOpenmaicProgress({ step: 'deps_node', label: '正在下载 Node.js 便携版…', pct: 8 });
  const toolsDir = TOOLS_DIR();
  ensureDir(toolsDir);
  const zipPath = path.join(toolsDir, 'node.zip');

  const proxyUrl = getEffectiveProxyUrl();
  const nodeMirrors = [
    proxyUrl ? `${proxyUrl}/${NODE_DOWNLOAD_URL}` : NODE_DOWNLOAD_URL,
    `${NODE_MIRROR_URL}/${NODE_LTS_VERSION}/node-${NODE_LTS_VERSION}-win-x64.zip`,
    NODE_DOWNLOAD_URL,
  ];

  try {
    await downloadFileWithMirror(proxyUrl ? `${proxyUrl}/${NODE_DOWNLOAD_URL}` : NODE_DOWNLOAD_URL, zipPath, nodeMirrors, (done, total) => {
      emitOpenmaicProgress({ step: 'deps_node', label: `下载 Node.js: ${(done / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`, pct: 8 + (done / total) * 12 });
    });
    emitOpenmaicProgress({ step: 'deps_node', label: '正在解压 Node.js…', pct: 20 });
    const tmpExtractDir = path.join(toolsDir, 'node_tmp');
    await extractZip(zipPath, tmpExtractDir);
    const entries = fs.readdirSync(tmpExtractDir);
    const nodeSubDir = entries.find(e => e.startsWith('node-v'));
    if (nodeSubDir) {
      const srcDir = path.join(tmpExtractDir, nodeSubDir);
      const destNodeDir = path.join(toolsDir, 'node');
      if (fs.existsSync(destNodeDir)) fs.rmSync(destNodeDir, { recursive: true, force: true });
      fs.renameSync(srcDir, destNodeDir);
    }
    try { fs.rmSync(tmpExtractDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(zipPath); } catch (_) {}
    nodeCmd = await findNode();
    if (!nodeCmd) throw new Error('Node.js 安装后仍无法找到 node 命令');
    return nodeCmd;
  } catch (err) {
    try { fs.unlinkSync(zipPath); } catch (_) {}
    throw new Error(`Node.js 自动安装失败: ${err.message}`);
  }
}

async function ensurePnpm(nodeCmd) {
  let pnpmResult = await findPnpm();
  if (pnpmResult) return pnpmResult;

  emitOpenmaicProgress({ step: 'deps_pnpm', label: '正在安装 pnpm…', pct: 22 });
  const nodeDir = path.dirname(nodeCmd);

  const systemNpm = findSystemNpm();
  if (systemNpm) {
    try {
      emitOpenmaicProgress({ step: 'deps_pnpm', label: '正在通过系统 npm 安装 pnpm…', pct: 24 });
      await runCommand(systemNpm, ['install', '-g', 'pnpm', '--registry', 'https://registry.npmmirror.com'], { 
        windowsHide: true 
      });
      pnpmResult = await findPnpm();
      if (pnpmResult) return pnpmResult;
    } catch (err) {
      console.warn('[openmaic] system npm install pnpm failed:', err.message);
    }
  }

  const npmCmd = path.join(nodeDir, 'npm.cmd');
  if (fs.existsSync(npmCmd)) {
    try {
      emitOpenmaicProgress({ step: 'deps_pnpm', label: '正在通过便携版 npm 安装 pnpm…', pct: 25 });
      await runCommand(npmCmd, ['install', '-g', 'pnpm', '--registry', 'https://registry.npmmirror.com'], { 
        cwd: nodeDir,
        windowsHide: true 
      });
      pnpmResult = await findPnpm();
      if (pnpmResult) return pnpmResult;
    } catch (err) {
      console.warn('[openmaic] portable npm install pnpm failed:', err.message);
    }
  }

  const corepackCmd = path.join(nodeDir, 'corepack.cmd');
  if (fs.existsSync(corepackCmd)) {
    try {
      emitOpenmaicProgress({ step: 'deps_pnpm', label: '正在通过 corepack 启用 pnpm…', pct: 26 });
      await runCommand(corepackCmd, ['enable'], { cwd: nodeDir, windowsHide: true });
      await runCommand(corepackCmd, ['prepare', 'pnpm@latest'], { cwd: nodeDir, windowsHide: true });
      pnpmResult = await findPnpm();
      if (pnpmResult) return pnpmResult;
    } catch (err) {
      console.warn('[openmaic] corepack enable pnpm failed:', err.message);
    }
  }

  const fallbackNpmCmds = [
    path.join(process.env.APPDATA || '', 'npm', 'npm.cmd'),
    'C:\Program Files\nodejs\npm.cmd',
  ];
  for (const fbNpm of fallbackNpmCmds) {
    if (fs.existsSync(fbNpm)) {
      try {
        emitOpenmaicProgress({ step: 'deps_pnpm', label: `正在通过 ${fbNpm} 安装 pnpm…`, pct: 27 });
        await runCommand(fbNpm, ['install', '-g', 'pnpm', '--registry', 'https://registry.npmmirror.com'], { 
          windowsHide: true 
        });
        pnpmResult = await findPnpm();
        if (pnpmResult) return pnpmResult;
      } catch (err) {
        console.warn('[openmaic] fallback npm install pnpm failed:', err.message);
      }
    }
  }

  throw new Error('无法自动安装 pnpm。请手动运行 npm install -g pnpm --registry https://registry.npmmirror.com 后重试。');
}

function findSystemNpm() {
  const candidates = ['npm.cmd', 'npm'];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\Program Files\nodejs\npm.cmd',
      path.join(process.env.APPDATA || '', 'npm', 'npm.cmd'),
    );
  }
  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ['--version'], { timeout: 5000, windowsHide: true, shell: true });
      if (r.status === 0) return cmd;
    } catch (_) {}
  }
  return null;
}

function runCommand(cmd, args, opts = {}) {
  const nodeDir = path.join(TOOLS_DIR(), 'node');
  let extraPaths = [];
  if (fs.existsSync(nodeDir)) {
    extraPaths.push(nodeDir);
    extraPaths.push(path.join(nodeDir, 'node_modules', '.bin'));
  }
  const npmGlobalDir = path.join(process.env.APPDATA || '', 'npm');
  if (fs.existsSync(npmGlobalDir)) {
    extraPaths.push(npmGlobalDir);
  }
  const pnpmGlobalDir = path.join(process.env.APPDATA || '', 'pnpm');
  if (fs.existsSync(pnpmGlobalDir)) {
    extraPaths.push(pnpmGlobalDir);
  }
  
  const cmdStr = `${cmd} ${args.join(' ')}`;
  console.log(`[openmaic] Running: ${cmdStr}`);
  
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { 
      ...opts, 
      windowsHide: true, 
      shell: process.platform === 'win32',
      env: { 
        ...process.env, 
        PATH: [...extraPaths, process.env.PATH].join(';'),
        LANG: 'zh_CN.UTF-8',
        PYTHONIOENCODING: 'utf-8',
      }
    });
    let stderr = '';
    proc.stderr?.on('data', d => {
      const msg = typeof d === 'string' ? d : d.toString('utf-8');
      stderr += msg;
      console.log(`[openmaic] stderr: ${msg.trim()}`);
      if (/clone|fetch|receiving|resolving|delta|pack|index/i.test(msg)) {
        emitOpenmaicProgress({ step: 'cloning', label: `克隆进度: ${msg.trim().substring(0, 50)}`, pct: 35 });
      }
    });
    proc.stdout?.on('data', d => {
      const msg = typeof d === 'string' ? d : d.toString('utf-8');
      console.log(`[openmaic] stdout: ${msg.trim()}`);
      if (/packages|added|removed|changed|install/i.test(msg)) {
        emitOpenmaicProgress({ step: 'installing', label: `安装依赖: ${msg.trim().substring(0, 60)}`, pct: 50 });
      }
      if (/clone|fetch|receiving|resolving|delta|pack|index/i.test(msg)) {
        emitOpenmaicProgress({ step: 'cloning', label: `克隆进度: ${msg.trim().substring(0, 50)}`, pct: 35 });
      }
    });
    proc.on('error', err => {
      console.error(`[openmaic] Command error: ${err.message}`);
      reject(err);
    });
    proc.on('close', code => {
      console.log(`[openmaic] Command finished with code: ${code}`);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Process exited with code ${code}`));
    });
  });
}

function writeOpenmaicEnvConfig(settings) {
  const configs = settings.aiConfigs || [];
  const activeId = settings.activeAiConfigId;
  const active = configs.find(c => c.id === activeId) || configs[0];
  const envPath = path.join(OPENMAIC_DIR(), '.env.local');

  let envContent = '';
  if (active) {
    const model = active.model || 'gpt-4o-mini';
    if (active.type === 'gemini') {
      envContent += `GOOGLE_API_KEY=${active.apiKey}\n`;
      if (active.baseUrl) envContent += `GOOGLE_BASE_URL=${active.baseUrl}\n`;
      envContent += `DEFAULT_MODEL=google:${model}\n`;
    } else {
      // OpenAI 兼容格式：需要 provider:model 前缀
      envContent += `OPENAI_API_KEY=${active.apiKey}\n`;
      envContent += `OPENAI_BASE_URL=${active.baseUrl || 'https://api.openai.com/v1'}\n`;
      envContent += `DEFAULT_MODEL=openai:${model}\n`;
    }
  }
  fs.writeFileSync(envPath, envContent, 'utf-8');
}

function getPnpmCommand(pnpmResult) {
  if (typeof pnpmResult === 'string') {
    return { cmd: pnpmResult, args: [] };
  }
  const nodeDir = path.dirname(pnpmResult.node);
  if (pnpmResult.viaCorepack) {
    return { cmd: path.join(nodeDir, 'corepack.cmd'), args: ['pnpm'] };
  }
  return { cmd: path.join(nodeDir, 'npx.cmd'), args: ['pnpm'] };
}

ipcMain.handle('openmaic:status', async () => {
  const installed = isOpenmaicInstalled();
  const portReady = await isOpenmaicPortReady();
  // 检测实际端口
  let port = 3000;
  for (const p of [3000, 3001]) {
    try {
      const res = await fetch(`http://localhost:${p}`, { method: 'GET', signal: AbortSignal.timeout(1000) });
      if (res.ok || res.status < 500) { port = p; break; }
    } catch (_) {}
  }
  return { installed, running: portReady, port };
});

ipcMain.handle('openmaic:install', async () => {
  try {
    emitOpenmaicProgress({ step: 'deps', label: '正在检查并安装所需依赖…', pct: 1 });

    const git = await ensureGit();
    const node = await ensureNode();
    const pnpm = await ensurePnpm(node);

    emitOpenmaicProgress({ step: 'deps_done', label: '依赖就绪，开始克隆仓库…', pct: 25 });

    const targetDir = OPENMAIC_DIR();
    
    const proxyUrl = getEffectiveProxyUrl();
    console.log(`[openmaic] proxyUrl: "${proxyUrl}"`);
    const gitMirrors = [
      proxyUrl ? `${proxyUrl}/${OPENMAIC_REPO_URL}` : OPENMAIC_REPO_URL,
      OPENMAIC_REPO_URL,
    ];
    console.log(`[openmaic] gitMirrors: ${JSON.stringify(gitMirrors)}`);

    let cloneSuccess = false;
    const CLONE_TIMEOUT = 300000;
    
    if (fs.existsSync(targetDir)) {
      const gitDir = path.join(targetDir, '.git');
      if (fs.existsSync(gitDir)) {
        console.log(`[openmaic] Directory exists, trying to update via git pull...`);
        emitOpenmaicProgress({ step: 'cloning', label: '正在更新仓库...', pct: 30 });
        
        try {
          for (const repoUrl of gitMirrors) {
            try {
              await runCommand(git, ['remote', 'set-url', 'origin', repoUrl], { cwd: targetDir });
              await runCommand(git, ['pull', '--depth', '1', 'origin', 'main'], { cwd: targetDir });
              cloneSuccess = true;
              console.log(`[openmaic] Successfully updated via git pull from: ${repoUrl}`);
              break;
            } catch (pullErr) {
              console.warn(`[openmaic] git pull from ${repoUrl} failed: ${pullErr.message}`);
            }
          }
        } catch (_) {}
      }
      
      if (!cloneSuccess) {
        console.log(`[openmaic] Update failed, trying to remove and re-clone...`);
        emitOpenmaicProgress({ step: 'cloning', label: '正在清理旧版本...', pct: 28 });
        try {
          await removeDirWithRetry(targetDir);
        } catch (removeErr) {
          console.error(`[openmaic] Failed to remove existing directory: ${removeErr.message}`);
          throw new Error('无法清理旧版本，请手动删除以下目录后重试：\n' + targetDir);
        }
      }
    }
    
    if (!cloneSuccess) {
      for (const repoUrl of gitMirrors) {
        try {
          emitOpenmaicProgress({ step: 'cloning', label: `克隆仓库: ${repoUrl}`, pct: 30 });
          console.log(`[openmaic] Starting clone from: ${repoUrl}`);
          
          const startTime = Date.now();
          let lastProgressTime = startTime;
          let progressTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const progressElapsed = Math.floor((Date.now() - lastProgressTime) / 1000);
            if (progressElapsed > 30) {
              console.warn(`[openmaic] Clone no progress for ${progressElapsed}s, elapsed: ${elapsed}s`);
              emitOpenmaicProgress({ step: 'cloning', label: `克隆中... ${elapsed}秒`, pct: 35 });
          } else {
            console.log(`[openmaic] Clone in progress, elapsed: ${elapsed}s`);
          }
        }, 10000);
        
        const clonePromise = runCommand(git, ['clone', '--depth', '1', '--progress', repoUrl, targetDir], { cwd: app.getPath('userData') });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('克隆超时')), CLONE_TIMEOUT));
        
        await Promise.race([clonePromise, timeoutPromise]);
        clearInterval(progressTimer);
        
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`[openmaic] Clone completed in ${elapsed}s`);
        cloneSuccess = true;
        break;
      } catch (err) {
        clearInterval(progressTimer);
        console.warn(`[openmaic] clone ${repoUrl} failed: ${err.message}, try next mirror`);
        emitOpenmaicProgress({ step: 'cloning', label: `克隆失败，尝试下一个源...`, pct: 30 });
      }
    }
    }
    if (!cloneSuccess) throw new Error('所有镜像源克隆仓库失败');

    emitOpenmaicProgress({ step: 'installing', label: '正在安装项目依赖…', pct: 40 });
    const { cmd: pnpmCmd, args: pnpmPrefixArgs } = getPnpmCommand(pnpm);
    
    const npmrcPath = path.join(targetDir, '.npmrc');
    fs.writeFileSync(npmrcPath, 'registry=https://registry.npmmirror.com\n', 'utf-8');

    // Patch: 替换子包中 Windows 不兼容的 rm -rf 命令
    const packagesToPatch = [
      'packages/@openmaic/dsl/package.json',
      'packages/@openmaic/importer/package.json',
      'packages/@openmaic/renderer/package.json',
    ];
    const rmReplace = 'node -e \\"require(\'fs\').rmSync(\'dist\',{recursive:true,force:true})\\"';
    for (const relPath of packagesToPatch) {
      const pkgJsonPath = path.join(targetDir, relPath);
      if (fs.existsSync(pkgJsonPath)) {
        let content = fs.readFileSync(pkgJsonPath, 'utf-8');
        const original = content;
        content = content.replace(/\brm\s+-rf\s+dist\b/g, rmReplace);
        if (content !== original) {
          fs.writeFileSync(pkgJsonPath, content, 'utf-8');
          console.log(`[openmaic] Patched ${relPath} for Windows compatibility`);
        }
      }
    }

    await runCommand(pnpmCmd, [...pnpmPrefixArgs, 'install'], { cwd: targetDir });

    emitOpenmaicProgress({ step: 'configuring', label: '正在配置 API…', pct: 80 });
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      writeOpenmaicEnvConfig(settings);
    }

    emitOpenmaicProgress({ step: 'done', label: '安装完成！', pct: 100 });
    return { success: true };
  } catch (err) {
    console.error('OpenMAIC install error:', err.message);
    emitOpenmaicProgress({ step: 'error', label: err.message, pct: 0 });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('openmaic:start', async () => {
  try {
    if (openmaicStarting) {
      console.log('[openmaic] Already starting, skipping');
      return { success: false, error: 'OpenMAIC 正在启动中，请稍候…' };
    }
    if (!isOpenmaicInstalled()) {
      console.log('[openmaic] Not installed');
      return { success: false, error: 'OpenMAIC 未安装，请先安装。' };
    }

    // 写入 env 配置（同步，很快）
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        writeOpenmaicEnvConfig(settings);
      } catch (_) {}
    }

    // 快速检查是否已在运行（不阻塞：用 net 模块端口探测代替 HTTP fetch）
    const portInUse = await new Promise(resolve => {
      const net = require('net');
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => resolve(false));
      socket.connect(3000, '127.0.0.1');
    });
    if (portInUse) {
      // 端口被占用，验证是否是 OpenMAIC（检查 Next.js 特征响应）
      try {
        const res = await fetch('http://localhost:3000', { method: 'GET', signal: AbortSignal.timeout(2000) });
        const text = await res.text();
        if (text.includes('__next') || text.includes('next') || text.includes('Next')) {
          openmaicPortReady = true;
          openmaicActualPort = 3000;
          console.log('[openmaic] Port 3000 has Next.js, assuming running');
          return { success: true, alreadyRunning: true, port: 3000 };
        }
      } catch (_) {}
      // 端口被占用但不是 OpenMAIC，继续启动（Next.js 会自动用 3001）
      console.log('[openmaic] Port 3000 occupied by other process, will try 3001');
    }

    // === 从这里开始全部放到后台异步执行，IPC 立即返回 ===
    openmaicStarting = true;
    emitOpenmaicProgress({ step: 'starting', label: '正在启动课程服务…', pct: 5 });

    // 清理上次残留的进程
    if (openmaicProcess) {
      console.log('[openmaic] Killing stale process');
      try { openmaicProcess.kill(); } catch (_) {}
      openmaicProcess = null;
    }

    // 杀掉占用端口的残留 node 进程（解决 .next/lock 文件被锁住的问题）
    // 使用异步 netstat 避免阻塞主进程事件循环
    const killPromises = [];
    for (const port of [3000, 3001]) {
      killPromises.push((async () => {
        try {
          const result = await spawnAsync('netstat', ['-ano'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
          if (result.stdout) {
            const lines = result.stdout.split('\n');
            for (const line of lines) {
              if (line.includes(`:${port} `) && line.includes('LISTENING')) {
                const pid = line.trim().split(/\s+/).pop();
                if (pid && /^\d+$/.test(pid)) {
                  console.log(`[openmaic] Killing process ${pid} on port ${port}`);
                  try { await spawnAsync('taskkill', ['/PID', pid, '/F', '/T'], { shell: true, stdio: 'ignore' }); } catch (_) {}
                }
              }
            }
          }
        } catch (_) {}
      })());
    }
    await Promise.all(killPromises);
    // 等一下让进程释放文件锁
    await new Promise(r => setTimeout(r, 500));

    // 立即返回前端，后续全部异步
    // 后台启动流程
    (async () => {
      try {
        // 异步清理 .next 目录
        const nextDir = path.join(OPENMAIC_DIR(), '.next');
        if (fs.existsSync(nextDir)) {
          emitOpenmaicProgress({ step: 'starting', label: '正在清理旧缓存…', pct: 10 });
          console.log('[openmaic] Removing stale .next directory');
          try {
            await fs.promises.rm(nextDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
            console.log('[openmaic] .next removed successfully');
          } catch (e) { console.warn('[openmaic] Failed to remove .next:', e.message); }
        }

        // 确保依赖就绪
        emitOpenmaicProgress({ step: 'starting', label: '正在检查运行环境…', pct: 20 });
        console.log('[openmaic] Checking Node.js...');
        const node = await ensureNode();
        console.log('[openmaic] Node.js ready:', node);

        emitOpenmaicProgress({ step: 'starting', label: '正在检查 pnpm…', pct: 25 });
        console.log('[openmaic] Checking pnpm...');
        const pnpm = await ensurePnpm(node);
        console.log('[openmaic] pnpm ready:', pnpm);

        // 启动 pnpm dev
        emitOpenmaicProgress({ step: 'starting', label: '正在启动 Next.js 服务…', pct: 30 });
        const { cmd: pnpmCmd, args: pnpmPrefixArgs } = getPnpmCommand(pnpm);
        console.log('[openmaic] Spawning:', pnpmCmd, [...pnpmPrefixArgs, 'dev'].join(' '));

        openmaicProcess = spawn(pnpmCmd, [...pnpmPrefixArgs, 'dev'], {
          cwd: OPENMAIC_DIR(),
          windowsHide: true,
          shell: process.platform === 'win32',
          env: { ...process.env },
        });

        // 捕获 spawn 本身失败
        openmaicProcess.on('error', (err) => {
          console.error('[openmaic] Spawn error:', err.message);
          openmaicStarting = false;
          openmaicProcess = null;
          openmaicPortReady = false;
          emitOpenmaicProgress({ step: 'error', label: `启动失败: ${err.message}`, pct: 0 });
        });

        openmaicProcess.stdout?.on('data', d => {
          const msg = d.toString();
          console.log('[openmaic:dev]', msg.trimEnd());
          const portMatch = msg.match(/Local:.*localhost:(\d+)/i);
          if (portMatch) {
            openmaicActualPort = parseInt(portMatch[1]);
            console.log(`[openmaic] Detected port: ${openmaicActualPort}`);
          }
          if (/ready|started|Local|localhost:\d+/i.test(msg)) {
            openmaicPortReady = true;
            openmaicStarting = false;
            emitOpenmaicProgress({ step: 'started', label: '服务已启动', pct: 100 });
          }
        });

        openmaicProcess.stderr?.on('data', d => {
          const msg = d.toString();
          console.log('[openmaic:dev:err]', msg.trimEnd());
          const portMatch = msg.match(/Local:.*localhost:(\d+)/i);
          if (portMatch) {
            openmaicActualPort = parseInt(portMatch[1]);
            console.log(`[openmaic] Detected port from stderr: ${openmaicActualPort}`);
          }
          if (/ready|started|Local|localhost:\d+/i.test(msg)) {
            openmaicPortReady = true;
            openmaicStarting = false;
            emitOpenmaicProgress({ step: 'started', label: '服务已启动', pct: 100 });
          }
        });

        openmaicProcess.on('exit', (code) => {
          console.log(`[openmaic] Process exited with code ${code}`);
          openmaicPortReady = false;
          openmaicStarting = false;
          openmaicProcess = null;
          emitOpenmaicProgress({ step: 'stopped', label: `服务已停止 (exit ${code})` });
        });

        // 后台超时监控（最多 60 秒）—— 只依赖 stdout 输出判断就绪，不做 TCP 探测
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 1000));
          if (!openmaicProcess) {
            console.log('[openmaic] Process gone, stopping poll');
            return;
          }
          if (openmaicPortReady) {
            console.log(`[openmaic] Port ${openmaicActualPort} confirmed ready via stdout`);
            return; // stdout 已发送 started 事件
          }
          if (i % 10 === 0 && i > 0) {
            console.log(`[openmaic] Still waiting... (${i}s)`);
            emitOpenmaicProgress({ step: 'starting', label: `正在启动 Next.js… (${i}秒)`, pct: 30 + Math.min(i, 30) });
          }
        }
        // 超时
        if (!openmaicPortReady) {
          openmaicStarting = false;
          console.error('[openmaic] Startup timeout after 60s');
          emitOpenmaicProgress({ step: 'error', label: '启动超时，服务未在 60 秒内就绪。', pct: 0 });
        }
      } catch (err) {
        openmaicStarting = false;
        console.error('[openmaic] Background startup error:', err.message);
        emitOpenmaicProgress({ step: 'error', label: `启动失败: ${err.message}`, pct: 0 });
      }
    })();

    // 立即返回前端，不阻塞
    return { success: true, starting: true };
  } catch (err) {
    openmaicStarting = false;
    console.error('OpenMAIC start error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('openmaic:stop', async () => {
  try {
    if (openmaicProcess) {
      try { openmaicProcess.kill(); } catch (_) {}
      openmaicProcess = null;
    }
    openmaicPortReady = false;
    openmaicStarting = false;
    // 异步清理 .next 缓存，确保下次启动干净
    const nextDir = path.join(OPENMAIC_DIR(), '.next');
    if (fs.existsSync(nextDir)) {
      try { await fs.promises.rm(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch (_) {}
    }
    return { success: true };
  } catch (err) {
    console.error('OpenMAIC stop error:', err.message);
    return { success: false, error: err.message };
  }
});

// ============================================================
// EasyOCR 服务
// ============================================================
let ocrProcess = null;
const OCR_PORT = 8766;

function findPython() {
  const candidates = ['python', 'python3', 'py'];
  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd, ['--version'], { shell: true, stdio: ['ignore', 'pipe', 'ignore'] });
      if (result.status === 0) return cmd;
    } catch (_) {}
  }
  return null;
}

async function isEasyOCRInstalled() {
  const python = findPython();
  if (!python) return false;
  try {
    const result = spawnSync(python, ['-c', 'import easyocr; print("ok")'], { shell: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return result.status === 0;
  } catch (_) {
    return false;
  }
}

async function ensureEasyOCR() {
  const python = findPython();
  if (!python) throw new Error('未找到 Python，请先安装 Python 3.8+');
  
  if (await isEasyOCRInstalled()) return;
  
  console.log('[ocr] Installing EasyOCR...');
  return new Promise((resolve, reject) => {
    const proc = spawn(python, ['-m', 'pip', 'install', 'easyocr', '--break-system-packages', '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple'], {
      shell: true,
      env: { ...process.env }
    });
    
    proc.stdout?.on('data', d => console.log('[ocr]', d.toString().trim()));
    proc.stderr?.on('data', d => console.log('[ocr]', d.toString().trim()));
    
    proc.on('close', code => {
      if (code === 0) {
        console.log('[ocr] EasyOCR installed successfully');
        resolve();
      } else {
        reject(new Error('EasyOCR 安装失败'));
      }
    });
    
    proc.on('error', reject);
  });
}

async function isOCRServerReady() {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port: OCR_PORT, path: '/health', method: 'GET' }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function startOCRServer() {
  if (ocrProcess) {
    return { success: true, alreadyRunning: true };
  }
  
  const python = findPython();
  if (!python) {
    return { success: false, error: '未找到 Python，请先安装 Python 3.8+' };
  }
  
  try {
    await ensureEasyOCR();
  } catch (err) {
    return { success: false, error: err.message };
  }
  
  const ocrScript = (app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'ocr', 'ocr_server.py')
    : path.join(__dirname, 'ocr', 'ocr_server.py')).replace(/\\/g, '/');

  ocrProcess = spawn(python, ['"' + ocrScript + '"', String(OCR_PORT)], {
    shell: true,
    env: { ...process.env },
    windowsHide: true,
  });
  
  ocrProcess.stdout?.on('data', d => console.log('[ocr]', d.toString().trim()));
  ocrProcess.stderr?.on('data', d => console.log('[ocr]', d.toString().trim()));
  
  ocrProcess.on('close', () => {
    console.log('[ocr] OCR server closed');
    ocrProcess = null;
  });
  
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await isOCRServerReady()) {
      return { success: true };
    }
  }
  
  return { success: false, error: 'OCR 服务启动超时' };
}

function stopOCRServer() {
  if (ocrProcess) {
    ocrProcess.kill();
    ocrProcess = null;
  }
}


ipcMain.handle('ocr:status', async () => {
  const python = findPython();
  const installed = await isEasyOCRInstalled();
  const running = await isOCRServerReady();
  return { pythonAvailable: !!python, installed, running };
});

ipcMain.handle('ocr:start', async () => {
  return startOCRServer();
});

ipcMain.handle('ocr:stop', async () => {
  stopOCRServer();
  return { success: true };
});

async function recognizeOCR(imageBase64) {
  if (!ocrProcess && !(await isOCRServerReady())) {
    const startResult = await startOCRServer();
    if (!startResult.success) {
      return { success: false, error: startResult.error };
    }
  }
  
  // 验证图片数据
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return { success: false, error: '无效的图片数据' };
  }
  
  // 检查图片大小（限制 10MB）
  const dataSize = Buffer.byteLength(imageBase64);
  if (dataSize > 10 * 1024 * 1024) {
    return { success: false, error: '图片文件过大，请压缩后重试' };
  }
  
  // 等待 EasyOCR reader 初始化完成（最多等 120 秒）
  for (let i = 0; i < 120; i++) {
    const initResult = await httpRequest('/init');
    if (initResult && initResult.status === 'ok') break;
    if (initResult && initResult.status === 'error') {
      return { success: false, error: 'OCR 模型加载失败: ' + (initResult.message || '未知错误') };
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return new Promise((resolve) => {
    const data = JSON.stringify({ image: imageBase64 });
    const req = http.request({
      hostname: '127.0.0.1',
      port: OCR_PORT,
      path: '/ocr',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ success: result.status === 'ok', ...result });
        } catch (_) {
          resolve({ success: false, error: 'OCR 服务返回无效数据' });
        }
      });
    });
    
    req.on('error', (err) => {
      resolve({ success: false, error: 'OCR 服务连接失败: ' + err.message });
    });
    
    req.setTimeout(120000, () => {
      req.destroy();
      resolve({ success: false, error: 'OCR 请求超时，请稍后重试' });
    });
    
    req.write(data);
    req.end();
  });
}

ipcMain.handle('ocr:recognize', async (_, imageBase64) => recognizeOCR(imageBase64));

// 辅助函数：发送 HTTP GET 请求到 OCR 服务器并解析 JSON 响应
function httpRequest(path) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: OCR_PORT,
      path: path,
      method: 'GET'
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

app.on('before-quit', () => {
  stopOCRServer();
  // 覆盖所有退出路径（托盘退出 / 关闭确认框退出 / 系统关机），确保 OpenMAIC 被强杀
  killOpenmaicProcesses();
});

// OCR 服务改为懒加载 — 不再在启动时自动拉起，而是在用户首次使用 OCR 功能时按需启动。
// 这样可以将启动时间减少 3-10 秒（取决于 Python 和 EasyOCR 是否已安装）。
// ocr:recognize IPC handler 已内置自动启动逻辑。

// ============================================================
// IPC: 手动清理 OpenMAIC 会话数据（供设置页面调用）
// ============================================================
ipcMain.handle('clear-openmaic-session', async () => {
  try {
    const openmaicSession = session.fromPartition('persist:openmaic');
    await openmaicSession.clearStorageData({
      storages: ['cookies', 'filesystem', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'],
    });
    await openmaicSession.clearCache();

    // 清理 OpenMAIC 运行时缓存
    const openmaicDir = path.join(app.getPath('userData'), 'openmaic');
    const nextDir = path.join(openmaicDir, '.next');
    if (fs.existsSync(nextDir)) {
      await fs.promises.rm(nextDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }

    return { success: true, message: 'OpenMAIC 会话数据和缓存已清除' };
  } catch (err) {
    console.error('Clear OpenMAIC session error:', err.message);
    return { success: false, error: err.message };
  }
});

// ============================================================
// IPC: 数据备份 / 还原（设置页面调用）
// 备份内容：历史成绩(grades.json) + 软件设置(settings.json) + 用户信息(user.json) + OpenMAIC 登录 Cookie
// ============================================================
const BACKUP_FILE_MARKER = '学习小工具';
const BACKUP_VERSION = 1;

ipcMain.handle('backup:create', async () => {
  try {
    // 直接读取磁盘上的真实持久化数据，避免前端缓存/状态差异
    const readFileSafe = (name) => {
      const p = path.join(DATA_DIR, name);
      if (!fs.existsSync(p)) return null;
      try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (_) { return null; }
    };

    const data = {
      settings: readFileSafe('settings.json') || {},
      user: readFileSafe('user.json') || {},
      grades: readFileSafe('grades.json') || [],
    };

    // 收集 OpenMAIC 会话分区中的 Cookie（登录态）
    let openmaicCookies = [];
    try {
      const sess = session.fromPartition('persist:openmaic');
      openmaicCookies = await sess.cookies.get({});
    } catch (e) {
      console.warn('[backup] 读取 OpenMAIC Cookie 失败:', e.message);
    }

    const backup = {
      app: BACKUP_FILE_MARKER,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      data,
      openmaic: { cookies: openmaicCookies },
    };

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '备份数据',
      defaultPath: `学习小工具-备份-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };

    ensureDataDir();
    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf-8');

    return {
      success: true,
      filePath,
      summary: {
        grades: Array.isArray(data.grades) ? data.grades.length : 0,
        hasSettings: !!data.settings && Object.keys(data.settings).length > 0,
        hasUser: !!data.user && Object.keys(data.user).length > 0,
        openmaicCookies: openmaicCookies.length,
      },
    };
  } catch (err) {
    console.error('[backup] 创建备份失败:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('backup:restore', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择备份文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
    });
    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    const filePath = filePaths[0];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const backup = JSON.parse(raw);

    if (!backup || backup.app !== BACKUP_FILE_MARKER || backup.version !== BACKUP_VERSION || !backup.data) {
      return { success: false, error: '无效的备份文件（文件格式不正确，或不是本软件导出的备份）。' };
    }

    ensureDataDir();
    const writeFileSafe = (name, content) => {
      const p = path.join(DATA_DIR, name);
      fs.writeFileSync(p, JSON.stringify(content, null, 2), 'utf-8');
    };

    if (backup.data.settings) writeFileSafe('settings.json', backup.data.settings);
    if (backup.data.user) writeFileSafe('user.json', backup.data.user);
    if (Array.isArray(backup.data.grades)) writeFileSafe('grades.json', backup.data.grades);

    // 还原 OpenMAIC Cookie（登录态）
    let cookieRestored = 0;
    let cookieErrors = 0;
    const cookies = (backup.openmaic && backup.openmaic.cookies) || [];
    if (cookies.length > 0) {
      try {
        const sess = session.fromPartition('persist:openmaic');
        for (const c of cookies) {
          try {
            // 仅保留可写字段；只读字段（hostOnly/session/storeId 等）会导致 set 失败
            const detail = {
              url: c.url || `http://${(c.domain || 'localhost').replace(/^\./, '')}${c.path || '/'}`,
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              secure: !!c.secure,
              httpOnly: !!c.httpOnly,
              sameSite: c.sameSite,
            };
            if (typeof c.expirationDate === 'number' && c.expirationDate > Date.now() / 1000) {
              detail.expirationDate = c.expirationDate;
            }
            await sess.cookies.set(detail);
            cookieRestored++;
          } catch (e) {
            cookieErrors++;
            console.warn('[backup] 还原 Cookie 失败:', e.message);
          }
        }
      } catch (e) {
        console.warn('[backup] 还原 Cookie 会话错误:', e.message);
      }
    }

    return {
      success: true,
      filePath,
      summary: {
        grades: Array.isArray(backup.data.grades) ? backup.data.grades.length : 0,
        hasSettings: !!backup.data.settings,
        hasUser: !!backup.data.user,
        openmaicCookies: cookieRestored,
        openmaicCookieErrors: cookieErrors,
      },
    };
  } catch (err) {
    console.error('[backup] 还原备份失败:', err.message);
    return { success: false, error: err.message };
  }
});

// ============================================================
// 单词本（Wordbook）功能
//   - 字典库：uapis.cn 翻译 API（免费额度 / API Key）
//   - 英文释义/音标：dictionaryapi.dev（免费、无需密钥）
//   - 例句：调用已配置的 AI（可选数量）
//   - 历史：wordbook.json（按最近访问排序），前端预索引加速搜索
// ============================================================
const WORDBOOK_FILE = 'wordbook.json';
const WORDBOOK_POPUP_HTML = 'wordbook-popup.html';

function readWordbookFile() {
  try {
    const filePath = path.join(DATA_DIR, WORDBOOK_FILE);
    if (!fs.existsSync(filePath)) return [];
    const arr = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.error('[wordbook] 读取失败:', err.message);
    return [];
  }
}

function writeWordbookFile(entries) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, WORDBOOK_FILE);
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
}

function getWordbookSettings() {
  try {
    const filePath = path.join(DATA_DIR, 'settings.json');
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_) {
    return null;
  }
}

function findWordbookEntry(entries, word) {
  const key = String(word || '').trim().toLowerCase();
  return entries.find(e => String(e.word || '').trim().toLowerCase() === key) || null;
}

/** 使用 uapis.cn 翻译 API 获取中文释义（en→zh，在线） */
async function translateWithUapis(word) {
  const settings = getWordbookSettings();
  const wb = (settings && settings.wordbook) || {};
  const apiKey = wb.translateApiKey || '';

  const url = 'https://uapis.cn/api/v1/translate/stream';
  const body = JSON.stringify({
    query: word,
    to_lang: '中文',
    from_lang: '英文',
  });

  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      let errBody = '';
      try { errBody = await res.text(); } catch (_) {}
      return { ok: false, error: `翻译API返回 ${res.status}: ${(errBody || '').slice(0, 120)}` };
    }

    // SSE 流式响应 — 收集所有 message 事件的 content 片段
    const text = await res.text();
    // 解析 SSE：提取 event:message 行的 data 内容
    let result = '';
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === 'event: message') {
        // 下一行应该是 data: {"content":"..."}
        const dataLine = lines[i + 1];
        if (dataLine && dataLine.startsWith('data:')) {
          try {
            const payload = JSON.parse(dataLine.slice(5).trim());
            if (payload.content) result += payload.content;
          } catch (_) {}
        }
      }
    }

    if (!result.trim()) {
      return { ok: false, error: '翻译API返回空结果' };
    }
    return { ok: true, text: result.trim() };
  } catch (e) {
    if (e.name === 'TimeoutError') return { ok: false, error: '翻译请求超时（15s），请检查网络' };
    return { ok: false, error: e.message };
  }
}

/** 使用 dictionaryapi.dev 获取英文释义与音标（免费、无需密钥） */
async function fetchEnglishDef(word) {
  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return { ok: false, phonetic: '', definitionEn: '' };
    }
    const data = await res.json();
    let phonetic = '';
    const defs = [];
    if (Array.isArray(data)) {
      for (const entry of data) {
        if (!phonetic && entry.phonetic) phonetic = entry.phonetic;
        if (!phonetic && Array.isArray(entry.phonetics)) {
          for (const p of entry.phonetics) {
            if (p.text) { phonetic = p.text; break; }
          }
        }
        if (Array.isArray(entry.meanings)) {
          for (const m of entry.meanings) {
            const pos = m.partOfSpeech || '';
            if (Array.isArray(m.definitions)) {
              for (const d of m.definitions) {
                if (d.definition) defs.push((pos ? `[${pos}] ` : '') + d.definition);
                if (defs.length >= 5) break;
              }
            }
            if (defs.length >= 5) break;
          }
        }
        if (defs.length >= 5) break;
      }
    }
    return { ok: true, phonetic, definitionEn: defs.join('\n') };
  } catch (e) {
    return { ok: false, phonetic: '', definitionEn: '', error: e.message };
  }
}

/** 调用已配置的 AI 生成例句（数量可配置，默认 3） */
async function generateExamplesWithAI(word, definitionZh) {
  const settings = getWordbookSettings();
  const wb = (settings && settings.wordbook) || {};
  const exampleCount = Math.max(1, Math.min(5, Number(wb.exampleCount) || 3)); // 1~5 条
  const configs = (settings && settings.aiConfigs) || [];
  const active = configs.find(c => c.id === (settings && settings.activeAiConfigId)) || configs[0] || null;
  if (!active || !active.apiKey) {
    return { ok: false, error: '未配置可用的 AI（请在设置中添加并激活 AI）' };
  }
  const prompt = `你是英语学习助手。请为英文单词或短语 "${word}"（中文释义：${definitionZh || '未知'}）生成 ${exampleCount} 个常用、地道的英文例句，每条附带中文翻译，便于记忆。
严格要求：仅输出一个 JSON 数组，元素格式为 {"en":"英文例句","zh":"中文翻译"}，不要任何额外说明文字。`;
  const messages = [
    { role: 'system', content: '你是一个严谨的英语学习助手，只输出符合要求的 JSON。' },
    { role: 'user', content: prompt },
  ];
  try {
    let content;
    if (active.type === 'gemini') content = await callGemini(active, messages, { maxTokens: 800, temperature: 0.6 });
    else content = await callOpenAI(active, messages, { maxTokens: 800, temperature: 0.6 });
    // 提取 JSON 数组
    const match = content.match(/\[[\s\S]*\]/);
    const jsonStr = match ? match[0] : content;
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      const examples = parsed
        .filter(x => x && (x.en || x.zh))
        .map(x => ({ en: String(x.en || ''), zh: String(x.zh || '') }))
        .slice(0, exampleCount);
      return { ok: true, examples };
    }
    return { ok: false, error: 'AI 返回格式无法解析' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 打开/聚焦单词本查词弹窗（置顶、仅关闭按钮、大圆角） */
function openWordbookPopup() {
  if (wordbookPopup) {
    if (wordbookPopup.isDestroyed()) wordbookPopup = null;
  }
  if (!wordbookPopup) {
    wordbookPopup = new BrowserWindow({
      width: 380,
      height: 540,
      minWidth: 320,
      minHeight: 400,
      frame: false,
      transparent: true,        // 配合 CSS 圆角
      alwaysOnTop: true,        // 置顶
      resizable: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    wordbookPopup.loadFile(path.join(__dirname, 'src', WORDBOOK_POPUP_HTML));
    wordbookPopup.on('closed', () => { wordbookPopup = null; });
    wordbookPopup.on('ready-to-show', () => {
      if (wordbookPopup && !wordbookPopup.isDestroyed()) {
        wordbookPopup.show();
        wordbookPopup.focus();
      }
    });
  } else {
    wordbookPopup.show();
    wordbookPopup.focus();
  }
}

/** 注册 / 更新单词本全局快捷键（含冲突检测） */
function registerWordbookShortcut() {
  try {
    // 先注销旧的
    if (registeredWordbookAccelerator) {
      globalShortcut.unregister(registeredWordbookAccelerator);
      registeredWordbookAccelerator = null;
    }
    const settings = getWordbookSettings();
    const wb = (settings && settings.wordbook) || {};
    // 仅当设置中明确关闭时才跳过；旧版设置文件可能无 wordbook 字段，默认视为启用
    if (wb.enabled === false) return;
    const accel = wb.shortcut || 'CommandOrControl+G';

    // 注意：globalShortcut.isRegistered() 在快捷键被「其他应用」占用时
    // 仍会返回 false（官方文档明确说明），因此无法用它预检外部冲突。
    // 正确方式是以 register() 的返回值判断：被占用时静默返回 false。
    const ret = globalShortcut.register(accel, () => {
      openWordbookPopup();
    });
    if (ret) {
      registeredWordbookAccelerator = accel;
      console.log('[wordbook] 全局快捷键已注册:', accel);
    } else {
      // 注册失败：几乎总是由其他软件占用导致
      console.warn('[wordbook] 全局快捷键注册失败（可能被其他程序占用）:', accel);
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        // 通知渲染进程用 Element 风格弹窗显示
        mainWindow.webContents.send('wordbook:shortcut-conflict-custom', {
          title: '快捷键注册失败',
          message: `单词本快捷键「${formatAcceleratorForDisplay(accel)}」注册失败，可能被其他程序占用。\n\n请在「设置 → 单词本」中将快捷键更换为其他组合（如 Ctrl+Shift+W），然后点击「重新绑定」。`,
        });
      }, 1500);
    }
  } catch (e) {
    console.error('[wordbook] 注册快捷键异常:', e.message);
  }
}

/** 将 Electron 加速键格式转为可读中文显示 */
function formatAcceleratorForDisplay(accel) {
  return accel.replace(/CommandOrControl/g, 'Ctrl').replace(/\+/g, '+');
}

ipcMain.handle('wordbook:lookup', async (_event, word) => {
  const w = String(word || '').trim();
  if (!w) return { success: false, error: '请输入单词' };
  const settings = getWordbookSettings();
  const mode = (settings && settings.wordbook && settings.wordbook.definitionMode) || 'zh';

  const entries = readWordbookFile();
  const existing = findWordbookEntry(entries, w);
  // 命中缓存：若条目无可用释义且无例句（上次查询失败时写入的空壳），则重新查询，避免永久缓存失败结果
  const cacheUsable = existing && (existing.definitionZh || existing.definitionEn || (Array.isArray(existing.examples) && existing.examples.length));
  if (existing && cacheUsable) {
    // 命中缓存：移到最前并更新访问时间
    const idx = entries.indexOf(existing);
    entries.splice(idx, 1);
    existing.lastAccessed = new Date().toISOString();
    entries.unshift(existing);
    writeWordbookFile(entries);
    return { success: true, entry: existing, cached: true, mode };
  }

  // 并行获取中文释义（uapis.cn）与英文释义（dictionaryapi.dev）
  const [zhRes, enRes] = await Promise.all([
    translateWithUapis(w),
    fetchEnglishDef(w),
  ]);

  const entry = {
    id: 'wb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    word: w,
    phonetic: enRes.phonetic || '',
    definitionZh: zhRes.ok ? zhRes.text : '',
    definitionEn: enRes.definitionEn || '',
    examples: [],
    definitionMode: mode,
    lastAccessed: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  if (!zhRes.ok && !enRes.ok) {
    // 两种来源都失败，仍记录以便下次重试，但提示用户
    writeWordbookFile(entries);
    return {
      success: true,
      entry,
      cached: false,
      mode,
      warning: '未能获取释义：' + (zhRes.error || enRes.error || '请检查网络连接'),
    };
  }
  entries.unshift(entry);
  writeWordbookFile(entries);
  return { success: true, entry, cached: false, mode };
});

ipcMain.handle('wordbook:examples', async (_event, payload) => {
  const { word, definitionZh } = payload || {};
  const w = String(word || '').trim();
  if (!w) return { success: false, error: '缺少单词' };
  const res = await generateExamplesWithAI(w, definitionZh);
  if (!res.ok) return { success: false, error: res.error };
  // 写入对应条目
  const entries = readWordbookFile();
  const entry = findWordbookEntry(entries, w);
  if (entry) {
    entry.examples = res.examples;
    writeWordbookFile(entries);
  }
  return { success: true, examples: res.examples };
});

ipcMain.handle('wordbook:list', async () => {
  const entries = readWordbookFile();
  return { success: true, entries };
});

ipcMain.handle('wordbook:delete', async (_event, id) => {
  const entries = readWordbookFile();
  const filtered = entries.filter(e => e.id !== id);
  if (filtered.length === entries.length) return { success: false, error: '未找到该条目' };
  writeWordbookFile(filtered);
  return { success: true };
});

ipcMain.handle('wordbook:set-favorite', async (_event, payload) => {
  const { id, favorite } = payload || {};
  const entries = readWordbookFile();
  const entry = entries.find(e => e.id === id);
  if (!entry) return { success: false, error: '未找到该条目' };
  entry.favorite = !!favorite;
  writeWordbookFile(entries);
  return { success: true, entry };
});

ipcMain.handle('wordbook:get-settings', async () => {
  const settings = getWordbookSettings() || {};
  const wb = settings.wordbook || { enabled: false, shortcut: 'CommandOrControl+G', definitionMode: 'zh' };
  const configs = settings.aiConfigs || [];
  const active = configs.find(c => c.id === settings.activeAiConfigId) || configs[0] || null;
  return {
    success: true,
    enabled: !!wb.enabled,
    shortcut: wb.shortcut || 'CommandOrControl+G',
    definitionMode: wb.definitionMode || 'zh',
    hasAI: !!(active && active.apiKey),
    themeColor: settings.themeColor || 'blue',
    darkMode: !!settings.darkMode,
  };
});

ipcMain.handle('wordbook:register-shortcut', async () => {
  registerWordbookShortcut();
  return { success: true };
});

ipcMain.handle('wordbook:open-popup', async () => {
  openWordbookPopup();
  return { success: true };
});

// ============================================================
// 日志 IPC（供「查看日志」窗口使用）
// ============================================================
// （日志功能已移除；保留占位注释以防误删）
