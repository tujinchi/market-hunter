/**
 * 供应链猎手 — 后端服务
 * 「新闻→赛道→隐形冠军→交叉匹配」四阶段选股引擎
 */
const express = require('express');
const compression = require('compression');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pipeline = require('./src/pipeline');
const store = require('./src/store');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 中间件 ====================

// 请求日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (req.path.startsWith('/api/')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

// 简单用户身份（基于 token）
function getUserToken(req) {
  return req.headers['x-user-token'] || req.query.token || 'anonymous';
}

// ==================== API 路由 ====================

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    uptime: process.uptime(),
    users: store.getUserCount(),
    analyses: store.getAnalysisCount(),
    timestamp: new Date().toISOString()
  });
});

// 获取当前用户信息
app.get('/api/user', (req, res) => {
  const token = getUserToken(req);
  const user = store.getOrCreateUser(token);
  res.json({
    token: user.token,
    analysisCount: user.analyses.length,
    createdAt: user.createdAt,
    lastActive: user.lastActive
  });
});

// 获取分析历史
app.get('/api/analyses', (req, res) => {
  const token = getUserToken(req);
  const limit = parseInt(req.query.limit) || 20;
  const analyses = store.getUserAnalyses(token, limit);
  res.json({ analyses, total: analyses.length });
});

// 获取单次分析详情
app.get('/api/analyses/:id', (req, res) => {
  const analysis = store.getAnalysis(req.params.id);
  if (!analysis) {
    return res.status(404).json({ error: '分析不存在或已过期' });
  }
  res.json(analysis);
});

// ==================== 核心 API：运行全流程 ====================

// 一键每日扫雷（自动模式）
app.post('/api/run/auto', async (req, res) => {
  const token = getUserToken(req);
  const analysisId = uuidv4();

  // 立即返回 analysisId，后台异步执行
  res.json({
    analysisId,
    mode: 'auto',
    status: 'running',
    message: '全流程已启动，轮询 /api/analyses/:id 获取进度'
  });

  // 异步执行管道
  try {
    await pipeline.runAuto(token, analysisId);
  } catch (err) {
    console.error(`[pipeline] auto run failed for ${analysisId}:`, err.message);
    store.updateAnalysis(analysisId, { status: 'error', error: err.message });
  }
});

// 手动输入模式
app.post('/api/run/manual', async (req, res) => {
  const token = getUserToken(req);
  const { message } = req.body;

  if (!message || message.trim().length < 10) {
    return res.status(400).json({ error: '请输入至少10个字符的消息内容' });
  }

  const analysisId = uuidv4();

  res.json({
    analysisId,
    mode: 'manual',
    status: 'running',
    message: '手动输入分析已启动'
  });

  try {
    await pipeline.runManual(token, analysisId, message.trim());
  } catch (err) {
    console.error(`[pipeline] manual run failed for ${analysisId}:`, err.message);
    store.updateAnalysis(analysisId, { status: 'error', error: err.message });
  }
});

// ==================== SSE 进度推送 ====================

app.get('/api/stream/:analysisId', (req, res) => {
  const { analysisId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // 初始状态
  const initial = store.getAnalysis(analysisId);
  if (!initial) {
    send('error', { message: '分析不存在' });
    return res.end();
  }

  send('init', { analysisId, status: initial.status, phases: initial.phases });

  // 轮询更新
  const interval = setInterval(() => {
    const current = store.getAnalysis(analysisId);
    if (!current) {
      send('error', { message: '分析数据丢失' });
      clearInterval(interval);
      return res.end();
    }

    send('progress', {
      status: current.status,
      phases: current.phases,
      currentPhase: current.currentPhase,
      summary: current.summary
    });

    if (current.status === 'completed' || current.status === 'error') {
      send('done', current);
      clearInterval(interval);
      res.end();
    }
  }, 800);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// ==================== 前端路由 ====================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== 启动 ====================

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   🦅 供应链猎手 v2.0                     ║
  ║   黑天鹅 → 供给缺口 → 隐形冠军            ║
  ║   服务已启动: http://localhost:${PORT}      ║
  ╚══════════════════════════════════════════╝
  `);
});
