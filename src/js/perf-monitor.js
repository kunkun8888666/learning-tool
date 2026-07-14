// ============================================================
// perf-monitor.js - 性能监控模块
// 收集 FPS、内存、DOM 节点数等关键指标
// 在生产环境中可通过 window.__perf 访问
// ============================================================

const PerfMonitor = {
  /** 是否已启动 */
  _started: false,
  /** 指标历史数据 */
  _history: {
    fps: [],
    memoryMb: [],
    domNodes: [],
    renderTime: [],
    timestamps: [],
  },
  /** 最大历史记录数 */
  _MAX_HISTORY: 120,
  /** FPS 采样计数器 */
  _frameCount: 0,
  _lastFrameTime: 0,
  _fpsInterval: null,
  _metricsInterval: null,
  /** webview 加载/渲染时间 */
  _webviewLoadStart: 0,

  /**
   * 启动性能监控
   * @param {boolean} verbose - 是否在控制台输出日志
   */
  start(verbose = false) {
    if (this._started) return;
    this._started = true;
    this._verbose = verbose;
    this._lastFrameTime = performance.now();

    // FPS 监控：每秒采样一次
    this._fpsInterval = setInterval(() => {
      const now = performance.now();
      const elapsed = now - this._lastFrameTime;
      // 超过 2 秒未采样视为空闲
      if (elapsed > 2000) {
        this._frameCount = 0;
        this._lastFrameTime = now;
        return;
      }
      const fps = Math.round((this._frameCount * 1000) / elapsed);
      this._recordFps(fps);
      this._frameCount = 0;
      this._lastFrameTime = now;
    }, 1000);

    // 综合指标监控：每 5 秒采样一次
    this._metricsInterval = setInterval(() => {
      this._sampleMetrics();
    }, 5000);

    // 每帧计数
    const tick = () => {
      if (!this._started) return;
      this._frameCount++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  /**
   * 停止性能监控
   */
  stop() {
    this._started = false;
    if (this._fpsInterval) { clearInterval(this._fpsInterval); this._fpsInterval = null; }
    if (this._metricsInterval) { clearInterval(this._metricsInterval); this._metricsInterval = null; }
  },

  /** 记录 webview 开始加载 */
  markWebviewLoadStart() {
    this._webviewLoadStart = performance.now();
  },

  /** 记录 webview 加载完成，返回加载耗时(ms) */
  markWebviewLoadEnd() {
    if (!this._webviewLoadStart) return 0;
    const elapsed = performance.now() - this._webviewLoadStart;
    this._webviewLoadStart = 0;
    if (this._verbose) {
      console.log(`[Perf] Webview 加载耗时: ${elapsed.toFixed(0)}ms`);
    }
    return elapsed;
  },

  /** 记录单次渲染耗时 */
  markRender(label, startTime) {
    if (!this._verbose) return;
    const elapsed = performance.now() - startTime;
    this._history.renderTime.push(elapsed);
    if (this._history.renderTime.length > this._MAX_HISTORY) {
      this._history.renderTime.shift();
    }
  },

  /** 单次 FPS 记录 */
  _recordFps(fps) {
    this._history.fps.push(fps);
    this._history.timestamps.push(Date.now());
    if (this._history.fps.length > this._MAX_HISTORY) {
      this._history.fps.shift();
      this._history.timestamps.shift();
    }
  },

  /** 采样综合指标 */
  _sampleMetrics() {
    // 内存使用（Chromium only）
    let memoryMb = 0;
    if (performance.memory) {
      memoryMb = performance.memory.usedJSHeapSize / (1024 * 1024);
    }
    this._history.memoryMb.push(memoryMb);

    // DOM 节点数
    const domNodes = document.getElementsByTagName('*').length;
    this._history.domNodes.push(domNodes);

    if (this._history.memoryMb.length > this._MAX_HISTORY) {
      this._history.memoryMb.shift();
      this._history.domNodes.shift();
    }
  },

  /**
   * 获取性能摘要报告
   * @returns {Object} 包含各项指标的统计摘要
   */
  getSummary() {
    const avg = (arr) => arr.length ? (arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
    const max = (arr) => arr.length ? Math.max(...arr) : 0;
    const min = (arr) => arr.length ? Math.min(...arr) : 0;

    const fpsHistory = this._history.fps.filter(f => f > 0);
    const memHistory = this._history.memoryMb.filter(m => m > 0);
    const domHistory = this._history.domNodes;
    const renderHistory = this._history.renderTime;

    return {
      fps: {
        avg: avg(fpsHistory).toFixed(1),
        min: min(fpsHistory),
        max: max(fpsHistory),
        current: fpsHistory[fpsHistory.length - 1] || 0,
        samples: fpsHistory.length,
      },
      memory: {
        avgMb: avg(memHistory).toFixed(1),
        maxMb: max(memHistory).toFixed(1),
        currentMb: (memHistory[memHistory.length - 1] || 0).toFixed(1),
        samples: memHistory.length,
      },
      dom: {
        avg: avg(domHistory).toFixed(0),
        min: min(domHistory),
        max: max(domHistory),
        current: domHistory[domHistory.length - 1] || 0,
      },
      render: {
        avgMs: avg(renderHistory).toFixed(1),
        maxMs: max(renderHistory).toFixed(1),
        samples: renderHistory.length,
      },
      uptimeS: this._history.timestamps.length > 0
        ? ((Date.now() - this._history.timestamps[0]) / 1000).toFixed(0)
        : 0,
    };
  },

  /**
   * 输出格式化的性能报告到控制台
   */
  report() {
    const s = this.getSummary();
    console.log('%c========== 性能报告 ==========', 'font-weight:bold;font-size:14px;');
    console.log(`运行时间: ${s.uptimeS}秒`);
    console.log(`FPS:  平均 ${s.fps.avg} | 最低 ${s.fps.min} | 当前 ${s.fps.current} (${s.fps.samples} 次采样)`);
    console.log(`内存: 平均 ${s.memory.avgMb}MB | 峰值 ${s.memory.maxMb}MB | 当前 ${s.memory.currentMb}MB`);
    console.log(`DOM:  平均 ${s.dom.avg} 节点 | 峰值 ${s.dom.max} | 当前 ${s.dom.current}`);
    if (s.render.samples > 0) {
      console.log(`渲染: 平均 ${s.render.avgMs}ms | 最长 ${s.render.maxMs}ms (${s.render.samples} 次记录)`);
    }
    console.log('%c===============================', 'font-weight:bold;');
    return s;
  },
};

// 暴露到全局作用域，方便在 DevTools 控制台调用
if (typeof window !== 'undefined') {
  window.__perf = PerfMonitor;
}
