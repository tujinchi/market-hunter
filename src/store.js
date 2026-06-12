/**
 * 数据存储层 — 文件系统 + 内存缓存
 * 支持多用户、分析记录持久化
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ANALYSES_DIR = path.join(DATA_DIR, 'analyses');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// 内存缓存
let users = {};
let analyses = {};

// ==================== 初始化 ====================

function init() {
  // 加载用户
  try {
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('[store] 用户数据加载失败，使用空数据');
    users = {};
  }

  // 加载分析记录
  try {
    if (!fs.existsSync(ANALYSES_DIR)) {
      fs.mkdirSync(ANALYSES_DIR, { recursive: true });
    }
    const files = fs.readdirSync(ANALYSES_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(ANALYSES_DIR, file), 'utf-8'));
        if (data.id) analyses[data.id] = data;
      } catch (e) { /* skip corrupted */ }
    }
  } catch (e) {
    console.warn('[store] 分析数据加载失败');
    analyses = {};
  }

  console.log(`[store] 已加载 ${Object.keys(users).length} 用户, ${Object.keys(analyses).length} 条分析`);
}

// ==================== 用户 ====================

function getOrCreateUser(token) {
  if (users[token]) {
    users[token].lastActive = new Date().toISOString();
    saveUsers();
    return users[token];
  }

  const user = {
    token,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    analyses: []
  };
  users[token] = user;
  saveUsers();
  return user;
}

function getUserCount() {
  return Object.keys(users).length;
}

// ==================== 分析记录 ====================

function createAnalysis(token, id, mode, inputMessage) {
  const analysis = {
    id,
    mode,
    inputMessage: inputMessage || null,
    userId: token,
    status: 'running',
    currentPhase: 0,
    phases: [
      { id: 1, name: '新闻扫描', status: 'pending' },
      { id: 2, name: '赛道发现', status: 'pending' },
      { id: 3, name: '冠军筛选', status: 'pending' },
      { id: 4, name: '交叉匹配', status: 'pending' },
      { id: 5, name: '数据验证', status: 'pending' }
    ],
    sectors: [],
    results: [],
    summary: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    error: null
  };

  analyses[id] = analysis;
  saveAnalysis(id, analysis);

  // 关联到用户
  const user = getOrCreateUser(token);
  user.analyses.unshift(id);
  if (user.analyses.length > 100) user.analyses = user.analyses.slice(0, 100);
  saveUsers();

  return analysis;
}

function updateAnalysis(id, updates) {
  if (!analyses[id]) return null;
  Object.assign(analyses[id], updates);
  analyses[id].updatedAt = new Date().toISOString();
  saveAnalysis(id, analyses[id]);
  return analyses[id];
}

function updatePhase(id, phaseNum, status) {
  if (!analyses[id]) return null;
  const phase = analyses[id].phases.find(p => p.id === phaseNum);
  if (phase) {
    phase.status = status;
    phase.completedAt = status === 'done' ? new Date().toISOString() : null;
  }
  analyses[id].currentPhase = phaseNum;
  analyses[id].updatedAt = new Date().toISOString();
  saveAnalysis(id, analyses[id]);
  return analyses[id];
}

function getAnalysis(id) {
  return analyses[id] || null;
}

function getUserAnalyses(token, limit = 20) {
  const user = users[token];
  if (!user) return [];
  return user.analyses.slice(0, limit).map(id => {
    const a = analyses[id];
    return a ? {
      id: a.id,
      mode: a.mode,
      status: a.status,
      sectorCount: a.sectors ? a.sectors.length : 0,
      resultCount: a.results ? a.results.length : 0,
      createdAt: a.createdAt,
      summary: a.summary
    } : null;
  }).filter(Boolean);
}

function getAnalysisCount() {
  return Object.keys(analyses).length;
}

// ==================== 持久化 ====================

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (e) {
    console.error('[store] 用户数据保存失败:', e.message);
  }
}

function saveAnalysis(id, data) {
  try {
    if (!fs.existsSync(ANALYSES_DIR)) {
      fs.mkdirSync(ANALYSES_DIR, { recursive: true });
    }
    const file = path.join(ANALYSES_DIR, `${id}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[store] 分析保存失败 ${id}:`, e.message);
  }
}

// ==================== 启动 ====================

init();

// ==================== 历史记录 ====================

/**
 * 将本次分析结果追加到 history.json（云端历史，供前端读取）
 * 只保留最近30条，每条包含精简摘要
 */
function appendToHistory(analysisRecord) {
  let history = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch (e) {
    history = [];
  }

  // 精简记录：只保留摘要信息，不含完整 sectors/results 细节
  const summary = {
    id: analysisRecord.id,
    mode: analysisRecord.mode,
    status: analysisRecord.status,
    createdAt: analysisRecord.createdAt,
    completedAt: analysisRecord.completedAt,
    sectorCount: analysisRecord.sectors ? analysisRecord.sectors.length : 0,
    resultCount: analysisRecord.results ? analysisRecord.results.length : 0,
    topThree: analysisRecord.summary ? analysisRecord.summary.topThree : '',
    methodology: analysisRecord.summary ? analysisRecord.summary.methodology : '',
    // 只保留前5条结果的精简信息
    topResults: (analysisRecord.results || []).slice(0, 5).map(r => ({
      code: r.code,
      name: r.name,
      totalScore: r.totalScore,
      coreLogic: r.coreLogic
    }))
  };

  history.unshift(summary);
  if (history.length > 30) history = history.slice(0, 30);

  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    console.log(`[store] 历史记录已更新，共 ${history.length} 条`);
  } catch (e) {
    console.error('[store] 历史记录保存失败:', e.message);
  }
}

module.exports = {
  getOrCreateUser,
  getUserCount,
  getUserAnalyses,
  createAnalysis,
  updateAnalysis,
  updatePhase,
  getAnalysis,
  getAnalysisCount,
  appendToHistory
};
