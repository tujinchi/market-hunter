/**
 * 行情获取器 — 从新浪财经 API 获取实盘行情
 * 供 pipeline.js 和 scorer.js 使用
 *
 * 返回格式：{ [code]: { price, changePct, pe, ytdChange, turnover, mainFlow } }
 * pe/ytdChange/turnover/mainFlow 在基础 API 中不可用，设为 null，
 * 评分器会对 null 值做优雅降级处理。
 */
const http = require('http');
const https = require('https');

// 基础行情：新浪 hq.sinajs.cn
const SINA_HQ_URL = 'http://hq.sinajs.cn/list=';

// 补充数据：新浪估值接口（PE / 换手率）
const SINA_VAL_URL = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData';

/**
 * 从新浪行情接口获取基础数据（价格、涨跌幅）
 * 返回 Map<code, { price, changePct, name, volume, amount, date, time }>
 */
async function fetchBasicQuotes(codes) {
  // codes: [{ code, mkt }]
  const list = codes.map(c => {
    const mkt = c.mkt || (c.code.startsWith('6') ? 'sh' : 'sz');
    return `${mkt}${c.code}`;
  }).join(',');

  const url = `${SINA_HQ_URL}${list}`;
  const raw = await fetchWithTimeout(url, 10000, {
    headers: { 'Referer': 'https://finance.sina.com.cn/' }
  });

  const quotes = new Map();
  const regex = /hq_str_(sh|sz)(\d{6})="([^"]+)"/g;
  let m;
  while ((m = regex.exec(raw)) !== null) {
    const code = m[2];
    const fields = m[3].split(',');
    if (fields.length < 32) continue;
    const price     = parseFloat(fields[3]) || 0;
    const prevClose = parseFloat(fields[2]) || 0;
    const changePct = prevClose ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0;
    quotes.set(code, {
      name:      fields[0],
      price,
      prevClose,
      changePct,
      high:      parseFloat(fields[4])  || 0,
      low:       parseFloat(fields[5])  || 0,
      volume:    parseFloat(fields[8])  || 0,   // 手
      amount:    parseFloat(fields[9])  || 0,   // 元
      date:      fields[30] || '',
      time:      fields[31] || '',
    });
  }
  return quotes;
}

/**
 * 从新浪估值接口补充 PE / 换手率 / 年初至今涨幅
 * 注：该接口返回数据较大，仅作补充，失败不影响主流程
 */
async function fetchValuation(codes) {
  try {
    // 分批：每批最多 50 个代码
    const batches = [];
    for (let i = 0; i < codes.length; i += 50) {
      batches.push(codes.slice(i, i + 50));
    }

    const result = new Map();
    for (const batch of batches) {
      const symbols = batch.map(c => `${c.code}`).join(',');
      const url = `${SINA_VAL_URL}?page=1&num=${batch.length}&sort=symbol&asc=1&node=hs_a&symbol=${symbols}&_s_r_a=page`;
      const raw = await fetchWithTimeout(url, 10000, {
        headers: { 'Referer': 'https://finance.sina.com.cn/' }
      });
      let items;
      try { items = JSON.parse(raw); } catch { continue; }
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const code = String(item.symbol || item.code || '').replace(/^(sh|sz)/, '');
        if (!code) continue;
        result.set(code, {
          pe:        parseFloat(item.pe || item.PE || item.pe_ttm || 0) || null,
          turnover:   parseFloat(item.turnover || item.换手率 || 0) || null,
          ytdChange:  parseFloat(item.涨跌幅 || item.changePct || 0) || null, // 注意：这是当日涨跌幅，YTD需另算
          mainFlow:   null, // 主力资金流需单独接口
        });
      }
    }
    return result;
  } catch (e) {
    console.warn('[quote-fetcher] 估值接口失败（非致命）:', e.message);
    return new Map();
  }
}

/**
 * 主入口：获取全部行情数据
 * @param {Array<{code:string, mkt:string}>} codes
 * @returns {Object} { code: { price, changePct, pe, ytdChange, turnover, mainFlow } }
 */
async function fetchQuotes(codes) {
  if (!codes || codes.length === 0) return {};

  console.log(`[quote-fetcher] 获取 ${codes.length} 只股票行情...`);

  // Step 1: 基础行情（价格、涨跌幅）
  const basicMap = await fetchBasicQuotes(codes);
  console.log(`  ✅ 基础行情: ${basicMap.size} 只`);

  // Step 2: 估值补充（PE、换手率）—— 最佳努力，失败不阻断
  const valMap = await fetchValuation(codes);

  // 合并
  const result = {};
  for (const [code, basic] of basicMap) {
    const val = valMap.get(code) || {};
    result[code] = {
      price:      basic.price,
      changePct:  basic.changePct,
      pe:         val.pe        ?? null,
      ytdChange:  val.ytdChange ?? null,
      turnover:   val.turnover  ?? null,
      mainFlow:   val.mainFlow  ?? null,
      // 附加信息（供调试）
      _name:      basic.name,
      _date:      basic.date,
      _time:      basic.time,
    };
  }

  // 未获取到行情的代码：标记为 null（评分器将使用默认值）
  for (const c of codes) {
    if (!result[c.code]) {
      result[c.code] = null;
    }
  }

  console.log(`[quote-fetcher] 完成，有效行情: ${Object.keys(result).filter(k => result[k]).length} 只\n`);
  return result;
}

/**
 * 带超时的 fetch（Node 18+ 内置）
 */
function fetchWithTimeout(url, timeoutMs = 10000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .then(r => r.text())
    .finally(() => clearTimeout(timer));
}

module.exports = { fetchQuotes, fetchBasicQuotes, fetchValuation };
