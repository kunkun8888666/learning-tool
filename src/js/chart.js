// ============================================================
// chart.js - 总分折线图 + 每科迷你折线图（SVG 渲染版）
// ============================================================

const GradeChart = {
  SUBJECT_COLORS: {
    '语文': '#3b82f6', '数学': '#ef4444', '英语': '#10b981',
    '科学': '#f59e0b', '道德与法治': '#8b5cf6', '道法': '#8b5cf6',
    '历史': '#6366f1', '物理': '#ec4899', '化学': '#14b8a6',
    '政治': '#f97316', '地理': '#84cc16', '生物': '#06b6d4',
  },

  // 时间筛选状态
  _timeRange: 'all',
  _allTotalsByDate: [],

  /** 构建 2×4 迷你图网格（无占位单元格） */
  buildMiniGrid(subjects) {
    const grid = document.getElementById('miniChartsGrid');
    grid.innerHTML = '';
    subjects.slice(0, 8).forEach(subj => {
      const color = this.SUBJECT_COLORS[subj] || '#94a3b8';
      const cell = document.createElement('div');
      cell.className = 'mini-chart-cell';
      cell.innerHTML = `
        <div class="mini-chart-cell-header">
          <span class="mini-chart-cell-title" style="color:${color}">${subj}</span>
        </div>
        <div class="mini-chart-svg-wrapper" id="miniChart-${subj}">
          <svg class="mini-chart-svg" viewBox="0 0 200 110" preserveAspectRatio="xMidYMid meet"></svg>
        </div>
        <div class="mini-chart-empty-msg hidden">暂无成绩数据</div>
      `;
      grid.appendChild(cell);
    });
    // 不再添加空占位单元格
  },

  /** 初始化总分图（惰性：SVG 在首次 updateTotal 时创建） */
  initTotal() {},

  /** 初始化某科目迷你图（惰性：SVG 在首次 updateMini 时填充） */
  initMini(subject) {},

  /**
   * 内部：渲染 SVG 折线图
   * @param {SVGSVGElement} svg
   * @param {{label:string, value:number}[]} data
   * @param {string} color
   * @param {{showFill?:boolean, showXLabels?:boolean, showYLabels?:boolean, yMax?:number}} options
   */
  _renderLineChart(svg, data, color, options = {}) {
    const { showFill = false, showXLabels = true, showYLabels = true, yMax: yMaxProp, yMin: yMinProp } = options;
    const isDark = document.documentElement.getAttribute('data-dark') === 'true';
    const textColor = isDark ? '#64748b' : '#94a3b8';
    const gridColor = isDark ? '#1e293b' : '#f1f5f9';

    svg.innerHTML = '';
    if (!data || data.length === 0) return;

    // Read actual viewBox dimensions instead of hardcoding
    const vb = svg.getAttribute('viewBox');
    let width = 200, height = 110;
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        width = parts[2];
        height = parts[3];
      }
    }

    const padding = { top: 10, right: 10, bottom: showXLabels ? 20 : 5, left: showYLabels ? 30 : 5 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const values = data.map(d => d.value);
    const yMax = yMaxProp || Math.max(100, Math.ceil(Math.max(...values, 0) / 10) * 10);
    const yMin = yMinProp !== undefined ? yMinProp : 0;

    const xStep = data.length > 1 ? chartW / (data.length - 1) : chartW;
    const toX = (i) => padding.left + (data.length > 1 ? i * xStep : chartW / 2);
    const toY = (v) => padding.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

    const NS = 'http://www.w3.org/2000/svg';

    // ---- 创建 tooltip ----
    const tooltipId = 'chart-tooltip';
    let tooltip = document.getElementById(tooltipId);
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = tooltipId;
      tooltip.style.cssText = 'position:fixed;display:none;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:6px;padding:6px 10px;font-size:12px;color:var(--text-primary);pointer-events:none;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
      document.body.appendChild(tooltip);
    }

    // ---- 水平网格线 + Y 轴标签 ----
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padding.top + (chartH / gridSteps) * i;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(padding.left));
      line.setAttribute('y1', String(y));
      line.setAttribute('x2', String(width - padding.right));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', gridColor);
      line.setAttribute('stroke-width', '0.5');
      svg.appendChild(line);

      if (showYLabels) {
        const label = document.createElementNS(NS, 'text');
        const val = Math.round(yMax - ((yMax - yMin) / gridSteps) * i);
        label.setAttribute('x', String(padding.left - 4));
        label.setAttribute('y', String(y + 3));
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('fill', textColor);
        label.setAttribute('font-size', '8');
        label.textContent = String(val);
        svg.appendChild(label);
      }
    }

    // ---- 填充区域 ----
    if (showFill && data.length > 1) {
      let pathD = `M ${toX(0)} ${toY(values[0])}`;
      for (let i = 1; i < data.length; i++) {
        pathD += ` L ${toX(i)} ${toY(values[i])}`;
      }
      pathD += ` L ${toX(data.length - 1)} ${padding.top + chartH}`;
      pathD += ` L ${toX(0)} ${padding.top + chartH} Z`;
      const fill = document.createElementNS(NS, 'path');
      fill.setAttribute('d', pathD);
      fill.setAttribute('fill', color + '18');
      fill.setAttribute('stroke', 'none');
      svg.appendChild(fill);
    }

    // ---- 折线 ----
    if (data.length > 1) {
      let lineD = `M ${toX(0)} ${toY(values[0])}`;
      for (let i = 1; i < data.length; i++) {
        lineD += ` L ${toX(i)} ${toY(values[i])}`;
      }
      const polyline = document.createElementNS(NS, 'path');
      polyline.setAttribute('d', lineD);
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', color);
      polyline.setAttribute('stroke-width', '1.5');
      polyline.setAttribute('stroke-linejoin', 'round');
      polyline.setAttribute('stroke-linecap', 'round');
      svg.appendChild(polyline);
    }

    // ---- 数据点（带 tooltip） ----
    data.forEach((d, i) => {
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', String(toX(i)));
      circle.setAttribute('cy', String(toY(d.value)));
      circle.setAttribute('r', '2.5');
      circle.setAttribute('fill', color);
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '1');
      circle.style.cursor = 'pointer';
      circle.style.transition = 'r 0.15s ease';

      // 悬停效果
      circle.addEventListener('mouseenter', (e) => {
        circle.setAttribute('r', '5');
        const rect = svg.getBoundingClientRect();
        const svgX = toX(i);
        const svgY = toY(d.value);
        const scaleX = rect.width / width;
        const scaleY = rect.height / height;
        const tooltipX = rect.left + svgX * scaleX + 10;
        const tooltipY = rect.top + svgY * scaleY - 30;
        tooltip.innerHTML = `<div style="font-weight:600;margin-bottom:2px;">${d.value}分</div><div style="color:var(--text-tertiary);font-size:11px;">${d.label}</div>`;
        tooltip.style.display = 'block';
        tooltip.style.left = tooltipX + 'px';
        tooltip.style.top = tooltipY + 'px';
      });

      circle.addEventListener('mouseleave', () => {
        circle.setAttribute('r', '2.5');
        tooltip.style.display = 'none';
      });

      svg.appendChild(circle);
    });

    // ---- X 轴标签 ----
    if (showXLabels && data.length > 0) {
      const maxLabels = Math.min(data.length, 5);
      const step = Math.max(1, Math.floor(data.length / maxLabels));
      data.forEach((d, i) => {
        if (i === 0 || i === data.length - 1 || i % step === 0) {
          const label = document.createElementNS(NS, 'text');
          label.setAttribute('x', String(toX(i)));
          label.setAttribute('y', String(height - 2));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('fill', textColor);
          label.setAttribute('font-size', '7');
          label.textContent = d.label;
          svg.appendChild(label);
        }
      });
    }
  },

  /** 更新总分折线图 */
  updateTotal(totalsByDate) {
    const emptyEl = document.getElementById('total-chart-empty');
    const container = document.querySelector('.total-chart-wrapper');
    let svg = container.querySelector('.total-chart-svg');

    // 保存原始数据用于时间筛选
    this._allTotalsByDate = totalsByDate || [];

    // 根据时间范围筛选数据
    const filtered = this._filterByTimeRange(this._allTotalsByDate, this._timeRange);

    if (!filtered || filtered.length === 0) {
      emptyEl.classList.remove('hidden');
      if (svg) svg.innerHTML = '';
      return;
    }
    emptyEl.classList.add('hidden');

    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'total-chart-svg');
      svg.setAttribute('viewBox', '0 0 800 220');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      container.insertBefore(svg, emptyEl);
    }

    const sorted = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#3b82f6';
    const data = sorted.map(d => ({
      label: this._fmtDate(d.date),
      value: d.total,
    }));

    // 直接用数据的最小值和最大值作为Y轴范围
    const values = data.map(d => d.value);
    const dataMax = Math.max(...values);
    const dataMin = Math.min(...values);

    // 留出上下边距，让数据点不贴边
    const range = dataMax - dataMin || 100;
    const yMax = dataMax + range * 0.1;
    const yMin = Math.max(0, dataMin - range * 0.1);

    this._renderLineChart(svg, data, primary, {
      showFill: true,
      showXLabels: true,
      showYLabels: true,
      yMax,
      yMin,
    });
  },

  /** 根据时间范围筛选数据 */
  _filterByTimeRange(data, range) {
    if (!data || data.length === 0) return [];
    if (range === 'all') return data;

    const now = new Date();
    let cutoffDate;

    switch (range) {
      case '7d':
        cutoffDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '1m':
        cutoffDate = new Date(now);
        cutoffDate.setMonth(cutoffDate.getMonth() - 1);
        break;
      case '3m':
        cutoffDate = new Date(now);
        cutoffDate.setMonth(cutoffDate.getMonth() - 3);
        break;
      case 'semester':
        cutoffDate = new Date(now);
        cutoffDate.setMonth(cutoffDate.getMonth() - 6);
        break;
      case '1y':
        cutoffDate = new Date(now);
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
        break;
      case '3y':
        cutoffDate = new Date(now);
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);
        break;
      default:
        return data;
    }

    return data.filter(d => new Date(d.date) >= cutoffDate);
  },

  /** 设置时间范围并更新图表 */
  setTimeRange(range) {
    this._timeRange = range;
    // 重新渲染总分图
    this.updateTotal(this._allTotalsByDate);
  },

  /** 更新某个科目的迷你图 */
  updateMini(subject, grades) {
    const wrapper = document.getElementById(`miniChart-${subject}`);
    if (!wrapper) return;
    const cell = wrapper.closest('.mini-chart-cell');
    const emptyMsg = cell?.querySelector('.mini-chart-empty-msg');
    const svg = wrapper.querySelector('.mini-chart-svg');

    if (!svg) return;

    const sorted = [...grades].filter(g => g.score > 0).sort((a, b) => new Date(a.date) - new Date(b.date));
    const color = this.SUBJECT_COLORS[subject] || '#94a3b8';

    if (sorted.length === 0) {
      wrapper.classList.add('hidden');
      emptyMsg?.classList.remove('hidden');
      svg.innerHTML = '';
      return;
    }
    wrapper.classList.remove('hidden');
    emptyMsg?.classList.add('hidden');

    const data = sorted.map(g => ({
      label: this._fmtDate(g.date),
      value: g.score,
    }));

    // 计算 Y 轴最大值：数据最高分向上取整到 10 的倍数，至少 100
    const dataMax = Math.max(...data.map(d => d.value), 0);
    const yMax = Math.max(100, Math.ceil(dataMax / 10) * 10);

    this._renderLineChart(svg, data, color, {
      showFill: false,
      showXLabels: true,
      showYLabels: true,
      yMax,
    });
  },

  /** 更新所有图表 */
  updateAll(totalsByDate, gradesBySubject, allSubjects) {
    this.updateTotal(totalsByDate);
    (allSubjects || Object.keys(gradesBySubject)).slice(0, 8).forEach(subj => {
      this.updateMini(subj, gradesBySubject[subj] || []);
    });
  },

  /** 销毁所有图表 */
  destroyAll() {
    // 清除总分 SVG
    const container = document.querySelector('.total-chart-wrapper');
    if (container) {
      const oldSvg = container.querySelector('.total-chart-svg');
      if (oldSvg) oldSvg.remove();
    }
    // 清除所有迷你图 SVG 内容
    document.querySelectorAll('.mini-chart-svg').forEach(svg => { svg.innerHTML = ''; });
  },

  /** 初始化所有迷你图（惰性，无需实际操作） */
  initAllMinis(subjects) {},

  _fmtDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  },
};
