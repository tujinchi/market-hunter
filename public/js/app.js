/* ============================================
   供应链猎手 v2.0 — 前端交互逻辑
   ============================================ */

let currentMode = 'auto';
let currentAnalysisId = null;
let isRunning = false;
let pollingTimer = null;
let userToken = localStorage.getItem('sch_token') || generateToken();

// ==================== 初始化 ====================

function generateToken() {
  const t = 'sch_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  localStorage.setItem('sch_token', t);
  return t;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('user-badge').textContent = '👤 ' + userToken.slice(0, 8) + '...';
  loadHistory();
});

// ==================== 模式切换 ====================

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
  document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + mode).classList.add('active');
}

// ==================== 自动运行 ====================

async function runAuto() {
  if (isRunning) {
    showToast('⏳ 分析正在运行中，请等待...', 'error');
    return;
  }
  startRun('auto');
  await executeRun('/api/run/auto', {});
}

async function runManual() {
  const msg = document.getElementById('msg-input').value.trim();
  if (msg.length < 10) {
    showToast('⚠️ 请输入至少10个字符的消息内容', 'error');
    return;
  }
  if (isRunning) {
    showToast('⏳ 分析正在运行中，请等待...', 'error');
    return;
  }
  startRun('manual');
  await executeRun('/api/run/manual', { message: msg });
}

async function executeRun(url, body) {
  const btnId = currentMode === 'auto' ? 'btn-auto' : 'btn-manual';
  const btn = document.getElementById(btnId);
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> 运行中...';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Token': userToken
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }

    const data = await res.json();
    currentAnalysisId = data.analysisId;

    // 开始轮询进度
    startPolling(data.analysisId);

  } catch (err) {
    stopRun();
    showToast('❌ ' + err.message, 'error');
    console.error('[app] run error:', err);
  }
}

// ==================== 进度轮询 ====================

function startPolling(analysisId) {
  if (pollingTimer) clearInterval(pollingTimer);

  pollingTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/analyses/${analysisId}`, {
        headers: { 'X-User-Token': userToken }
      });
      if (!res.ok) return;

      const data = await res.json();
      updateProgress(data);

      if (data.status === 'completed') {
        stopRun();
        renderResults(data);
        loadHistory();
        showToast(`✅ 分析完成！${data.sectors.length}个赛道·${data.results.length}只标的`, 'success');
      } else if (data.status === 'error') {
        stopRun();
        showToast('❌ ' + (data.error || '分析失败'), 'error');
      }
    } catch (e) {
      // ignore polling errors
    }
  }, 1000);
}

function updateProgress(data) {
  const section = document.getElementById('progress-section');
  section.style.display = 'block';

  const phases = data.phases || [];
  const doneCount = phases.filter(p => p.status === 'done').length;
  const totalPhases = phases.length || 5;
  const pct = Math.round((doneCount / totalPhases) * 100);

  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent =
    phases[doneCount] ? `Phase ${doneCount + 1}: ${phases[doneCount].name}...` : '生成报告中...';

  // 更新阶段标记
  document.querySelectorAll('.ps').forEach(el => {
    const phase = parseInt(el.dataset.phase);
    el.classList.remove('active', 'done');
    if (phase <= doneCount) el.classList.add('done');
    if (phase === doneCount + 1) el.classList.add('active');
  });
}

function startRun(mode) {
  isRunning = true;
  document.getElementById('progress-section').style.display = 'block';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-label').textContent = 'Phase 1: 新闻扫描中...';
  document.querySelectorAll('.ps').forEach(el => {
    el.classList.remove('active', 'done');
    if (el.dataset.phase === '1') el.classList.add('active');
  });
  document.getElementById('empty-state').style.display = 'none';
}

function stopRun() {
  isRunning = false;
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }

  const btnAuto = document.getElementById('btn-auto');
  const btnManual = document.getElementById('btn-manual');
  btnAuto.disabled = false;
  btnAuto.innerHTML = '<span>⚡</span> 立即运行全流程';
  btnManual.disabled = false;
  btnManual.innerHTML = '<span>🔍</span> 结合输入运行全流程';
}

// ==================== 渲染结果 ====================

function renderResults(data) {
  const container = document.getElementById('results-container');
  const empty = document.getElementById('empty-state');
  empty.style.display = 'none';
  container.style.display = 'block';

  // 摘要
  renderSummary(data);

  // 赛道
  renderSectors(data.sectors || []);

  // 排名
  renderRanking(data.results || []);

  // 统计
  if (currentMode === 'auto') {
    document.getElementById('stats-auto').innerHTML = `
      <div class="stat-item"><span class="stat-val">${data.sectors.length}</span><span class="stat-label">覆盖赛道</span></div>
      <div class="stat-item"><span class="stat-val">${data.results.length}</span><span class="stat-label">冠军标的</span></div>
      <div class="stat-item"><span class="stat-val">v2.0</span><span class="stat-label">方法论</span></div>
    `;
  }
}

function renderSummary(data) {
  const summary = data.summary || {};
  const el = document.getElementById('result-summary');

  let html = `<div class="rs-title">📋 分析完成</div>`;
  html += `<div class="rs-stats">`;
  html += `<span class="rs-stat">赛道数: <span class="rs-num">${data.sectors.length}</span></span>`;
  html += `<span class="rs-stat">入选标的: <span class="rs-num">${data.results.length}</span></span>`;
  html += `<span class="rs-stat">方法论: <span class="rs-num">v2.0</span></span>`;
  html += `<span class="rs-stat">时间: <span class="rs-num">${new Date(data.completedAt).toLocaleTimeString('zh-CN')}</span></span>`;
  html += `</div>`;

  if (summary.topThree) {
    html += `<div class="rs-note"><strong>🏆 TOP 3:</strong>\n${summary.topThree}</div>`;
  }
  if (summary.userNote) {
    html += `<div class="rs-note">📝 ${summary.userNote}</div>`;
  }

  el.innerHTML = html;
}

function renderSectors(sectors) {
  const el = document.getElementById('sector-list');
  if (sectors.length === 0) {
    el.innerHTML = '';
    return;
  }

  let html = `<h3 style="margin-bottom:14px">🏭 发现 ${sectors.length} 个供给瓶颈赛道</h3>`;

  sectors.forEach((sector, i) => {
    const severityClass = sector.severity || 'medium';
    const sevLabel = { critical: '🔴 严重', high: '🟠 高', medium: '🟡 中等' }[severityClass] || '🟡 中等';

    html += `
    <div class="sector-card ${severityClass} ${i === 0 ? 'open' : ''}" onclick="toggleSector(this)">
      <div class="sector-header">
        <span class="sh-name">${sector.name}</span>
        <span class="sh-severity ${severityClass}">${sevLabel}</span>
      </div>
      <div class="sector-body">
        <div class="sb-gap">⚠️ 缺口产品：${sector.gapProduct || '—'}<br>📌 触发：${sector.trigger || '—'}<br>⏰ 持续：${sector.duration || '—'}</div>
        <div class="sb-champions">
          ${(sector.champions || []).slice(0, 3).map((c, ci) => `
            <div class="champion-mini ${ci === 0 ? 'top' : ''}">
              <div class="cm-name">${['🥇','🥈','🥉'][ci]} ${c.name}(${c.code})</div>
              <div class="cm-rank">${c.rank || ''}</div>
              <div class="cm-share">市占率: ${c.sharePct || '—'}</div>
            </div>
          `).join('')}
          ${(sector.champions || []).length === 0 ? '<div class="champion-mini"><div class="cm-name">🔍 该赛道暂无冠军数据库匹配</div></div>' : ''}
        </div>
      </div>
    </div>`;
  });

  el.innerHTML = html;
}

function renderRanking(results) {
  const el = document.getElementById('ranking-section');
  if (results.length === 0) {
    el.innerHTML = '';
    return;
  }

  let html = `<h3>🏆 综合评分排序</h3><div class="ranking-table">`;

  results.forEach((r, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const changeClass = (r.quote?.changePct || 0) >= 0 ? 'up' : 'down';
    const changeSign = (r.quote?.changePct || 0) >= 0 ? '+' : '';
    const pe = r.quote?.pe > 0 ? r.quote.pe.toFixed(1) : '亏损';

    // 破解明细
    const bd = r.scoreBreakdown || {};
    const breakdownLabels = {
      purity: '冠军纯度', logic: '逻辑匹配', valuation: '估值安全',
      trend: '技术趋势', fund: '资金情绪'
    };

    html += `
    <div class="rank-card ${i === 0 ? 'top' : ''}">
      <div class="rank-num ${rankClass}">${rankEmoji}</div>
      <div class="rank-body">
        <div class="rank-header">
          <span class="rank-name">${r.name}</span>
          <span class="rank-code">${r.code}.${r.market === 'SH' ? 'SH' : 'SZ'}</span>
          <span class="rank-change ${changeClass}">${changeSign}${(r.quote?.changePct || 0).toFixed(2)}%</span>
          <span class="rank-score">${r.totalScore}<span style="font-size:0.65rem;color:var(--text-muted)">/100</span></span>
        </div>
        <div class="rank-metrics">
          <span class="rank-metric"><span class="rm-label">现价</span><span class="rm-value">${r.quote?.price || '—'}</span></span>
          <span class="rank-metric"><span class="rm-label">PE</span><span class="rm-value">${pe}</span></span>
          <span class="rank-metric"><span class="rm-label">YTD</span><span class="rm-value">${(r.quote?.ytdChange || 0).toFixed(1)}%</span></span>
          <span class="rank-metric"><span class="rm-label">换手</span><span class="rm-value">${(r.quote?.turnover || 0).toFixed(1)}%</span></span>
          <span class="rank-metric"><span class="rm-label">主力净额</span><span class="rm-value">${formatMoney(r.quote?.mainFlow || 0)}万</span></span>
        </div>
        <div class="rank-reason">
          <strong>入选：</strong>${r.matchReasons?.join('；') || r.coreLogic || ''}
          ${r.sharePct ? ' | 市占率: ' + r.sharePct : ''}
        </div>
        ${r.warnings?.length > 0 ? `<div class="rank-warning">⚠️ ${r.warnings.join(' | ')}</div>` : ''}
        <div class="rank-breakdown">
          ${Object.entries(bd).map(([k, v]) =>
            `<span class="rb-item">${breakdownLabels[k] || k}: <strong>${v}</strong></span>`
          ).join('')}
        </div>
      </div>
    </div>`;
  });

  html += '</div>';
  el.innerHTML = html;
}

// ==================== 赛道折叠 ====================

function toggleSector(card) {
  card.classList.toggle('open');
}

// ==================== 历史记录 ====================

async function loadHistory() {
  try {
    const res = await fetch('/api/analyses?limit=15', {
      headers: { 'X-User-Token': userToken }
    });
    if (!res.ok) return;

    const data = await res.json();
    const list = document.getElementById('history-list');

    if (!data.analyses || data.analyses.length === 0) {
      list.innerHTML = '<div class="history-empty">暂无历史记录</div>';
      return;
    }

    list.innerHTML = data.analyses.map(a => `
      <div class="history-item" onclick="loadAnalysis('${a.id}')">
        <div class="hi-mode">${a.mode === 'auto' ? '🔄 每日扫雷' : '✍️ 手动输入'}</div>
        <div class="hi-meta">
          ${new Date(a.createdAt).toLocaleString('zh-CN')} | ${a.sectorCount}赛道·${a.resultCount}标的
          <span class="hi-status ${a.status}">${a.status === 'completed' ? '✅' : a.status === 'running' ? '⏳' : '❌'}</span>
        </div>
      </div>
    `).join('');

  } catch (e) {
    console.error('[app] loadHistory error:', e);
  }
}

async function loadAnalysis(id) {
  try {
    const res = await fetch(`/api/analyses/${id}`, {
      headers: { 'X-User-Token': userToken }
    });
    if (!res.ok) return;

    const data = await res.json();
    if (data.status === 'completed') {
      renderResults(data);
    } else if (data.status === 'running') {
      currentAnalysisId = id;
      startRun(data.mode || 'auto');
      startPolling(id);
    } else {
      showToast('该分析未能成功完成', 'error');
    }
  } catch (e) {
    console.error('[app] loadAnalysis error:', e);
  }
}

// ==================== 工具函数 ====================

function formatMoney(val) {
  if (Math.abs(val) >= 10000) {
    return (val / 10000).toFixed(1) + '亿';
  }
  return val.toFixed(0);
}

function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
