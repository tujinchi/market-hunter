/**
 * 选股引擎 — 四阶段管道
 * Phase 1: 新闻广度扫描 → 赛道发现
 * Phase 2: 每赛道冠军筛选
 * Phase 3: 交叉匹配（冠军产品 × 缺口品类）
 * Phase 4: 数据验证 + 综合评分
 */
const store = require('./store');
const newsScanner = require('./news-scanner');
const championFinder = require('./champion-finder');
const crossMatcher = require('./cross-matcher');
const scorer = require('./scorer');
const quoteFetcher = require('./quote-fetcher');

/**
 * 延迟工具
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 自动模式：扫描最近2天新闻 → 完整管道
 */
async function runAuto(token, analysisId) {
  const analysis = store.createAnalysis(token, analysisId, 'auto', null);

  try {
    // ===== Phase 1: 新闻扫描 + 赛道发现 =====
    store.updatePhase(analysisId, 1, 'running');
    const { sectors, newsDigest } = await newsScanner.scanRecent(2);
    store.updatePhase(analysisId, 1, 'done');

    if (sectors.length === 0) {
      store.updateAnalysis(analysisId, {
        status: 'completed',
        summary: '📭 近2日未发现重大供应链瓶颈新闻',
        sectors: [],
        results: [],
        completedAt: new Date().toISOString()
      });
      return;
    }

    // 保存赛道
    const sectorRecords = sectors.map((s, i) => ({
      id: `sector-${i + 1}`,
      name: s.name,
      gapProduct: s.gapProduct,
      trigger: s.trigger,
      duration: s.duration,
      priceChange: s.priceChange,
      severity: s.severity
    }));

    store.updateAnalysis(analysisId, { sectors: sectorRecords, newsDigest });

    // ===== Phase 2: 冠军筛选（每赛道独立） =====
    store.updatePhase(analysisId, 2, 'running');
    await sleep(300);

    for (let i = 0; i < sectors.length; i++) {
      const sector = sectors[i];
      sector.champions = await championFinder.findChampions(sector);
      sectorRecords[i].champions = sector.champions;
    }

    store.updateAnalysis(analysisId, { sectors: sectorRecords });
    store.updatePhase(analysisId, 2, 'done');

    // ===== Phase 3: 交叉匹配 =====
    store.updatePhase(analysisId, 3, 'running');
    await sleep(300);

    const matches = [];
    for (const sector of sectors) {
      const sectorMatches = crossMatcher.match(sector);
      matches.push(...sectorMatches);
    }

    store.updatePhase(analysisId, 3, 'done');

    // ===== Phase 4: 数据验证 + 评分 =====
    store.updatePhase(analysisId, 4, 'running');
    await sleep(300);

    // 获取实盘行情
    const quoteCodes = matches.map(m => ({ code: m.code, mkt: m.code.startsWith('6') ? 'sh' : 'sz' }));
    const realQuotes = await quoteFetcher.fetchQuotes(quoteCodes);
    const scoredResults = await scorer.scoreAndRank(matches, realQuotes);
    store.updatePhase(analysisId, 4, 'done');

    // ===== Phase 5: 最终排序 =====
    store.updatePhase(analysisId, 5, 'running');
    await sleep(200);

    const finalResults = scoredResults.slice(0, 10);

    const summary = generateSummary(sectors.length, finalResults);

    store.updateAnalysis(analysisId, {
      status: 'completed',
      results: finalResults,
      summary,
      completedAt: new Date().toISOString()
    });
    // 追加到历史记录（云端 history.json）
    const completedRecordAuto = store.getAnalysis(analysisId);
    store.appendToHistory(completedRecordAuto);
    store.updatePhase(analysisId, 5, 'done');

  } catch (err) {
    console.error(`[pipeline:auto] 错误:`, err.message);
    store.updateAnalysis(analysisId, {
      status: 'error',
      error: err.message,
      completedAt: new Date().toISOString()
    });
  }
}

/**
 * 手动模式：融合用户输入 → 完整管道
 */
async function runManual(token, analysisId, userMessage) {
  const analysis = store.createAnalysis(token, analysisId, 'manual', userMessage);

  try {
    // ===== Phase 1: 解析输入 + 新闻融合 =====
    store.updatePhase(analysisId, 1, 'running');
    const { parsedSectors, parsedProducts } = await newsScanner.parseUserInput(userMessage);

    // 同时扫描新闻
    const { sectors: newsSectors, newsDigest } = await newsScanner.scanRecent(2);

    // 融合：用户输入的赛道优先级最高
    const allSectors = mergeSectors(parsedSectors, newsSectors);
    store.updatePhase(analysisId, 1, 'done');

    if (allSectors.length === 0 && newsSectors.length === 0) {
      store.updateAnalysis(analysisId, {
        status: 'completed',
        summary: '📭 未从输入消息和近期新闻中发现明确的供应链瓶颈赛道',
        sectors: [],
        results: [],
        completedAt: new Date().toISOString()
      });
      return;
    }

    const sectorRecords = allSectors.map((s, i) => ({
      id: `sector-${i + 1}`,
      name: s.name,
      gapProduct: s.gapProduct,
      trigger: s.trigger,
      duration: s.duration,
      priceChange: s.priceChange,
      severity: s.severity,
      fromUserInput: s.fromUserInput || false
    }));

    store.updateAnalysis(analysisId, {
      sectors: sectorRecords,
      newsDigest,
      userParsedProducts: parsedProducts
    });

    // Phase 2-5 与自动模式相同
    store.updatePhase(analysisId, 2, 'running');
    await sleep(300);

    for (let i = 0; i < allSectors.length; i++) {
      const sector = allSectors[i];
      sector.champions = await championFinder.findChampions(sector);
      sectorRecords[i].champions = sector.champions;
    }
    store.updateAnalysis(analysisId, { sectors: sectorRecords });
    store.updatePhase(analysisId, 2, 'done');

    store.updatePhase(analysisId, 3, 'running');
    await sleep(300);

    const matches = [];
    for (const sector of allSectors) {
      const sectorMatches = crossMatcher.match(sector);
      matches.push(...sectorMatches);
    }
    store.updatePhase(analysisId, 3, 'done');

    store.updatePhase(analysisId, 4, 'running');
    await sleep(300);

    // 获取实盘行情
    const quoteCodes = matches.map(m => ({ code: m.code, mkt: m.code.startsWith('6') ? 'sh' : 'sz' }));
    const realQuotes = await quoteFetcher.fetchQuotes(quoteCodes);
    const scoredResults = await scorer.scoreAndRank(matches, realQuotes);
    store.updatePhase(analysisId, 4, 'done');

    store.updatePhase(analysisId, 5, 'running');
    await sleep(200);

    const finalResults = scoredResults.slice(0, 10);
    const summary = generateSummary(allSectors.length, finalResults, userMessage);

    store.updateAnalysis(analysisId, {
      status: 'completed',
      results: finalResults,
      summary,
      completedAt: new Date().toISOString()
    });
    // 追加到历史记录（云端 history.json）
    const completedRecordManual = store.getAnalysis(analysisId);
    store.appendToHistory(completedRecordManual);
    store.updatePhase(analysisId, 5, 'done');

  } catch (err) {
    console.error(`[pipeline:manual] 错误:`, err.message);
    store.updateAnalysis(analysisId, {
      status: 'error',
      error: err.message,
      completedAt: new Date().toISOString()
    });
  }
}

// ==================== 辅助 ====================

function mergeSectors(parsedSectors, newsSectors) {
  const merged = [...parsedSectors];

  for (const ns of newsSectors) {
    // 检查是否与用户输入重复
    const isDuplicate = merged.some(ms =>
      ms.gapProduct && ns.gapProduct &&
      (ms.gapProduct.includes(ns.gapProduct) || ns.gapProduct.includes(ms.gapProduct))
    );
    if (!isDuplicate) {
      merged.push({ ...ns, fromUserInput: false });
    }
  }

  return merged;
}

function generateSummary(sectorCount, results, userMessage) {
  const topThree = results.slice(0, 3).map((r, i) =>
    `${['🥇', '🥈', '🥉'][i]} ${r.name}(${r.code}) — ${r.totalScore}分 | ${r.coreLogic}`
  ).join('\n');

  const userNote = userMessage
    ? `\n📝 已融合手动输入: "${userMessage.slice(0, 60)}${userMessage.length > 60 ? '...' : ''}"`
    : '';

  return {
    sectorCount,
    resultCount: results.length,
    topThree,
    userNote,
    timestamp: new Date().toISOString(),
    methodology: 'v2.0 — 新闻→赛道→隐形冠军→交叉匹配'
  };
}

module.exports = { runAuto, runManual };
