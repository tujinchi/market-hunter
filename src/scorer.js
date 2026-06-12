/**
 * 综合评分器 — Phase 4
 * 五维度加权评分，输出最终排序
 *
 * 权重分配：
 * - 冠军纯度（市占率/壁垒）: 30%
 * - 逻辑匹配度（产品=缺口？供应刚性？）: 25%
 * - 估值安全边际（PE/YTD）: 20%
 * - 技术趋势（趋势结构）: 15%
 * - 资金/情绪（主力流向）: 10%
 *
 * v2.1: 支持传入 realQuotes（来自 quote-fetcher），
 *       对 null 字段做优雅降级（不惩罚未知数据）
 */

const MOCK_QUOTES = {
  '605589': { price: 58.32, changePct: -3.36, pe: 51.2, ytdChange: 108.2, turnover: 4.8, mainFlow: -2850 },
  '600183': { price: 151.28, changePct: 1.04, pe: 94.3, ytdChange: 113.8, turnover: 5.2, mainFlow: 40230 },
  '300408': { price: 126.50, changePct: -3.90, pe: 84.1, ytdChange: 179.2, turnover: 3.2, mainFlow: -18900 },
  '000636': { price: 59.12, changePct: -8.06, pe: 222.6, ytdChange: 263.1, turnover: 18.7, mainFlow: -45600 },
  '601958': { price: 25.52, changePct: 10.00, pe: 24.4, ytdChange: 63.8, turnover: 0.5, mainFlow: 12800 },
  '603993': { price: 19.11, changePct: 10.02, pe: 16.9, ytdChange: -3.0, turnover: 3.1, mainFlow: 65000 },
  '688525': { price: 327.90, changePct: 1.12, pe: 39.2, ytdChange: 185.7, turnover: 11.4, mainFlow: -3520 },
  '688008': { price: 224.88, changePct: -1.67, pe: 107.5, ytdChange: 90.9, turnover: 7.8, mainFlow: -94700 },
  '603986': { price: 481.47, changePct: -0.42, pe: 117.4, ytdChange: 125.5, turnover: 5.3, mainFlow: -28100 },
  '688146': { price: 302.00, changePct: -13.66, pe: 443.9, ytdChange: 647.5, turnover: 19.6, mainFlow: -21100 },
  '605090': { price: 37.28, changePct: 2.61, pe: 18.7, ytdChange: -13.5, turnover: 3.3, mainFlow: 3221 },
  '688548': { price: 28.95, changePct: -11.74, pe: 119.0, ytdChange: 99.1, turnover: 7.2, mainFlow: -3372 },
  '688268': { price: 188.50, changePct: -17.62, pe: 192.9, ytdChange: 228.5, turnover: 14.8, mainFlow: -37700 },
  '688106': { price: 28.17, changePct: -14.89, pe: 162.5, ytdChange: 45.7, turnover: 12.6, mainFlow: -23900 },
  '002428': { price: 92.26, changePct: 4.56, pe: 1050, ytdChange: 86.3, turnover: 8.9, mainFlow: 5600 },
  '002916': { price: 379.50, changePct: 0.89, pe: 71.2, ytdChange: 92.4, turnover: 4.6, mainFlow: 12800 },
  '301176': { price: 56.60, changePct: 19.99, pe: -1, ytdChange: 124.9, turnover: 22.5, mainFlow: 14600 },
  '300184': { price: 14.21, changePct: -5.08, pe: 60.7, ytdChange: 41.8, turnover: 6.3, mainFlow: -4500 },
  '688019': { price: 225.00, changePct: -2.36, pe: 62.2, ytdChange: 34.5, turnover: 5.1, mainFlow: -8200 },
  '300346': { price: 59.39, changePct: -10.97, pe: 117.8, ytdChange: 39.3, turnover: 22.4, mainFlow: -31200 },
  '002669': { price: 18.50, changePct: -2.1, pe: 45.0, ytdChange: 28.0, turnover: 3.5, mainFlow: -1200 },
  '603186': { price: 35.20, changePct: -1.8, pe: 55.0, ytdChange: 42.0, turnover: 4.1, mainFlow: -1800 },
  '301389': { price: 42.30, changePct: -2.5, pe: 68.0, ytdChange: 55.0, turnover: 5.2, mainFlow: -2200 },
  '600176': { price: 15.80, changePct: -1.2, pe: 18.5, ytdChange: 22.0, turnover: 2.1, mainFlow: 3500 },
  '603228': { price: 55.40, changePct: -0.8, pe: 38.0, ytdChange: 65.0, turnover: 3.8, mainFlow: 2100 }
};

const DEFAULT_QUOTE = { price: 0, changePct: 0, pe: null, ytdChange: null, turnover: null, mainFlow: null };

/**
 * 主入口：对匹配结果评分排序
 * @param {Array} matches - cross-matcher 的输出
 * @param {Object|null} realQuotes - quote-fetcher.fetchQuotes() 的输出，格式：{ code: { price, changePct, pe, ... } }
 * @returns {Array} 按总分降序排列的评分结果
 */
async function scoreAndRank(matches, realQuotes = null) {
  const scored = [];

  for (const match of matches) {
    // 行情来源优先级：realQuotes > MOCK_QUOTES > DEFAULT_QUOTE
    const real = (realQuotes && realQuotes[match.code] != null) ? realQuotes[match.code] : null;
    const mock = MOCK_QUOTES[match.code] || null;
    const quote = real || mock || { ...DEFAULT_QUOTE };

    // ===== 维度1：冠军纯度 (30%) =====
    let purityScore = (match.championPurity ?? 60) / 100 * 30;
    if (match.sharePct && (match.sharePct.includes('唯一') || match.sharePct.includes('稀缺'))) purityScore += 5;
    purityScore = Math.min(30, purityScore);

    // ===== 维度2：逻辑匹配度 (25%) =====
    let logicScore = (match.matchScore ?? 50) / 100 * 25;
    if (match.warnings && match.warnings.length > 2) logicScore *= 0.6;
    else if (match.warnings && match.warnings.length > 0) logicScore *= 0.8;

    // ===== 维度3：估值安全边际 (20%) =====
    let valuationScore = 0;
    if (quote.pe == null) {
      // PE 未知：给中性分（不惩罚）
      valuationScore = 10;
    } else if (quote.pe > 0) {
      if (quote.pe < 25) valuationScore = 18;
      else if (quote.pe < 50) valuationScore = 15;
      else if (quote.pe < 80) valuationScore = 12;
      else if (quote.pe < 120) valuationScore = 8;
      else if (quote.pe < 200) valuationScore = 5;
      else valuationScore = 2;
    } else {
      valuationScore = 2; // 亏损（PE <= 0）
    }
    // YTD 惩罚（仅当 ytdChange 已知时）
    if (quote.ytdChange != null) {
      if (quote.ytdChange > 300) valuationScore = Math.max(1, valuationScore - 8);
      else if (quote.ytdChange > 200) valuationScore = Math.max(1, valuationScore - 5);
      else if (quote.ytdChange > 100) valuationScore = Math.max(1, valuationScore - 2);
    }

    // ===== 维度4：技术趋势 (15%) =====
    let trendScore = 10; // 基准
    // 今日涨跌幅信号
    if (quote.changePct > 9) trendScore += 3;
    else if (quote.changePct < -10) trendScore -= 5;
    else if (quote.changePct < -7) trendScore -= 3;
    else if (quote.changePct > 0) trendScore += 1;
    // 换手率（仅当已知时）
    if (quote.turnover != null) {
      if (quote.turnover > 15) trendScore -= 2;
      else if (quote.turnover < 2) trendScore += 1;
    }
    trendScore = Math.max(2, Math.min(15, trendScore));

    // ===== 维度5：资金/情绪 (10%) =====
    let fundScore = 5; // 基准（neutral）
    if (quote.mainFlow != null) {
      if (quote.mainFlow > 50000) fundScore = 9;
      else if (quote.mainFlow > 10000) fundScore = 8;
      else if (quote.mainFlow > 0) fundScore = 7;
      else if (quote.mainFlow > -5000) fundScore = 5;
      else if (quote.mainFlow > -20000) fundScore = 3;
      else fundScore = 1;
    }
    // mainFlow == null：保持 fundScore = 5（neutral，不惩罚）

    // ===== 综合总分 =====
    const totalScore = Math.round(purityScore + logicScore + valuationScore + trendScore + fundScore);

    scored.push({
      ...match,
      totalScore,
      scoreBreakdown: {
        purity: Math.round(purityScore),
        logic: Math.round(logicScore),
        valuation: Math.round(valuationScore),
        trend: Math.round(trendScore),
        fund: Math.round(fundScore)
      },
      quote: {
        price: quote.price,
        changePct: quote.changePct,
        pe: quote.pe,
        ytdChange: quote.ytdChange,
        turnover: quote.turnover,
        mainFlow: quote.mainFlow
      },
      coreLogic: (match.matchReasons || []).slice(0, 2).join('；')
    });
  }

  // 按总分降序排序
  scored.sort((a, b) => b.totalScore - a.totalScore);

  // 添加排名
  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

module.exports = { scoreAndRank };
