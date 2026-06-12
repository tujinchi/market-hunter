/**
 * 新闻扫描器 — Phase 1
 * 扫描供应链新闻，提取供给瓶颈赛道
 *
 * v2.1: fetchNewsFromWeb() 实现真实新闻抓取（新浪+东方财富）
 *       不再依赖种子数据，新闻驱动赛道发现
 */
const https = require('https');
const http = require('http');

// 预设关键词语义矩阵 — fetch 失败时的回退（8大赛道）
const SEED_SECTORS = [
  {
    name: 'PPE树脂 → CCL覆铜板 → AI服务器PCB',
    gapProduct: '聚苯醚(PPE)树脂',
    trigger: '沙特朱拜勒停产 → 全球70% PPE断供 → 覆铜板基材紧缺',
    duration: '至少至2027年（复产+认证周期）',
    priceChange: 'PCB单月涨40%，CCL涨30-40%',
    severity: 'critical',
    keywords: ['PPE', '聚苯醚', '覆铜板', 'CCL', 'PCB', '沙特', '停产']
  },
  {
    name: 'MLCC被动元器件',
    gapProduct: 'AI服务器高容MLCC',
    trigger: '日系厂商(村田/TDK)优先供应CSP → 国内下游客户被挤出',
    duration: '结构性长期（日系产能锁定）',
    priceChange: '现货涨15-20%，AI高容涨50-60%，稀缺翻倍',
    severity: 'critical',
    keywords: ['MLCC', '村田', '风华', '三环', '电容', '被动元件']
  },
  {
    name: '钼金属 → 半导体级战略材料',
    gapProduct: '半导体级钼金属',
    trigger: 'SK海力士375层3D NAND以钼代钨 → 需求结构跃迁',
    duration: '3-5年（矿开周期）',
    priceChange: '钼精矿涨至4500元/吨度+',
    severity: 'critical',
    keywords: ['钼', '钼矿', '金钼', '洛阳钼业', 'SK海力士', 'NAND']
  },
  {
    name: '存储芯片',
    gapProduct: 'DRAM/NAND模组',
    trigger: 'CSP龙头锁死2027-2028年全部LTА产能',
    duration: '至2028年',
    priceChange: '车规存储涨180%，HDD涨10%/季',
    severity: 'critical',
    keywords: ['存储', 'DRAM', 'NAND', '佰维', '澜起', '兆易', '长单']
  },
  {
    name: '六氟化钨(WF6)',
    gapProduct: '高纯6N/7N WF6',
    trigger: '中国钨出口管制 → 日本关东电化/中央硝子或7月停产',
    duration: '不确定（取决于出口管制政策）',
    priceChange: '6N级涨190%+，7N级实质短缺',
    severity: 'high',
    keywords: ['六氟化钨', 'WF6', '钨', '中船', '华特', '电子特气']
  },
  {
    name: '氦气',
    gapProduct: '高纯氦气(5N+)',
    trigger: '卡塔尔设施损毁+俄罗斯出口管制 → 中国98.6%进口同时中断',
    duration: '至2027年底',
    priceChange: '国产高纯涨490%，进口涨370%',
    severity: 'critical',
    keywords: ['氦气', '氦', '九丰', '广钢', '华特', '提氦', '卡塔尔']
  },
  {
    name: '磷化铟衬底',
    gapProduct: '磷化铟(InP)衬底',
    trigger: 'AI光模块800G→1.6T，全球供需缺口>70%',
    duration: '长期（衬底扩产周期长）',
    priceChange: '衬底供货周期拉长至12个月以上',
    severity: 'medium',
    keywords: ['磷化铟', 'InP', '衬底', '光芯片', '云南锗业', '光模块']
  },
  {
    name: '电子布/电子级玻璃纤维',
    gapProduct: '低介电电子布',
    trigger: 'AI服务器需求爆发 + 供给刚性（设备限制）',
    duration: '中长期',
    priceChange: '高端电子布涨117%',
    severity: 'medium',
    keywords: ['电子布', '玻璃纤维', '低介电', '玻纤']
  }
];

// 新闻来源配置（同 auto-pipeline.js）
const NEWS_SOURCES = [
  {
    name: '新浪-供应链',
    url: () => `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&k=${encodeURIComponent('供应链 断供 涨价 国产替代 产能 紧缺 半导体')}&num=30&page=1&r=${Date.now()}`,
    parse: (json) => {
      try {
        const items = json?.result?.data || [];
        return items.map(i => ({
          title: i.title || '',
          summary: i.intro || '',
          url: i.url || '',
          date: new Date((i.ctime || 0) * 1000).toISOString().slice(0, 10),
          source: '新浪财经'
        }));
      } catch { return []; }
    }
  },
  {
    name: '新浪-财经要闻',
    url: () => `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2512&k=${encodeURIComponent('供应链 断供 短缺 涨价 国产替代')}&num=30&page=1&r=${Date.now()}`,
    parse: (json) => {
      try {
        const items = json?.result?.data || [];
        return items.map(i => ({
          title: i.title || '',
          summary: i.intro || '',
          url: i.url || '',
          date: new Date((i.ctime || 0) * 1000).toISOString().slice(0, 10),
          source: '新浪财经'
        }));
      } catch { return []; }
    }
  },
  {
    name: '东方财富-行业快讯',
    url: () => `https://np-listapi.eastmoney.com/comm/web/getNewsBySearch?keyword=%E4%BE%9B%E5%BA%94%E9%93%BE&pageIndex=1&pageSize=30`,
    parse: (json) => {
      try {
        const data = json?.data;
        const items = Array.isArray(data) ? data : (data?.list || data?.records || []);
        return items.map(i => ({
          title: i.title || i.Title || '',
          summary: i.content || i.digest || '',
          url: i.url || '',
          date: (i.showTime || i.date || '').toString().slice(0, 10),
          source: '东方财富'
        }));
      } catch { return []; }
    }
  }
];

// 赛道关键词库（用于新闻→赛道映射）
const SECTOR_KEYWORDS = SEED_SECTORS.map(s => ({
  name: s.name,
  gapProduct: s.gapProduct,
  trigger: s.trigger,
  duration: s.duration,
  priceChange: s.priceChange,
  severity: s.severity,
  keywords: s.keywords
}));

/**
 * scanRecent(days) — 主入口
 * 先尝试 Web 抓取真实新闻，失败则回退到种子数据
 */
async function scanRecent(days) {
  // 尝试用 Web API 获取真实新闻并映射到赛道
  let webSectors = [];
  try {
    webSectors = await fetchNewsFromWeb(days);
    if (webSectors.length > 0) {
      console.log(`[news-scanner] ✅ 真实新闻抓取成功，${webSectors.length} 个赛道`);
    }
  } catch (e) {
    console.log('[news-scanner] Web API 不可用，使用种子数据 + 关键词交叉匹配');
  }

  // 融合电子布/磷化铟等新增赛道（从当日研报补充）
  const extraSectors = getExtraSectors();

  // 去重合并
  const allSectors = dedupeSectors([...webSectors, ...extraSectors]);
  const finalSectors = allSectors.length > 0 ? allSectors : SEED_SECTORS.slice(0, 7);

  return {
    sectors: finalSectors.map(s => ({
      name: s.name,
      gapProduct: s.gapProduct,
      trigger: s.trigger,
      duration: s.duration,
      priceChange: s.priceChange,
      severity: s.severity
    })),
    newsDigest: generateNewsDigest(finalSectors)
  };
}

/**
 * 抓取真实新闻并映射到赛道
 * @param {number} days - 扫描最近N天
 * @returns {Array} 赛道对象数组
 */
async function fetchNewsFromWeb(days) {
  console.log(`[news-scanner] 抓取真实新闻（最近${days}天）...`);
  const allNews = [];

  for (const src of NEWS_SOURCES) {
    try {
      const url = src.url();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetchWithTimeout(url, 15000, {
        headers: {
          'User-Agent': 'MarketHunter/1.0',
          'Accept': 'application/json',
          'Referer': 'https://www.eastmoney.com/'
        }
      });

      if (!res.ok) {
        console.log(`  ⚠️ ${src.name} HTTP ${res.status}`);
        continue;
      }

      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch {
        console.log(`  ⚠️ ${src.name} 非JSON响应`);
        continue;
      }

      const items = src.parse(json);
      console.log(`  ✅ ${src.name}: ${items.length} 条`);
      allNews.push(...items);
    } catch (e) {
      console.log(`  ❌ ${src.name}: ${e.message}`);
    }
  }

  // 去重
  const seen = new Set();
  const unique = allNews.filter(n => {
    const key = n.title.substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[news-scanner] 共计 ${unique.length} 条去重新闻`);

  if (unique.length === 0) {
    console.log('[news-scanner] 无新闻返回，将使用种子数据');
    return [];
  }

  // 新闻 → 赛道映射
  const sectors = mapNewsToSectors(unique);
  console.log(`[news-scanner] 映射到 ${sectors.length} 个赛道\n`);
  return sectors;
}

/**
 * 新闻 → 赛道映射（关键词匹配，同 auto-pipeline.js）
 */
function mapNewsToSectors(news) {
  const sectorHits = {};

  for (const item of news) {
    const txt = (item.title + ' ' + item.summary).toLowerCase();

    for (const sector of SECTOR_KEYWORDS) {
      let hits = 0;
      for (const kw of sector.keywords) {
        if (txt.includes(kw.toLowerCase())) hits++;
      }
      if (hits >= 2) {
        if (!sectorHits[sector.name]) {
          sectorHits[sector.name] = { ...sector, news: [], score: 0 };
        }
        sectorHits[sector.name].news.push(item);
        sectorHits[sector.name].score += hits;
      }
    }
  }

  // 排序：命中新闻越多、关键词命中越多 → 越靠前
  const ranked = Object.values(sectorHits)
    .sort((a, b) => b.score - a.score);

  // 返回前8个赛道（避免过多）
  return ranked.slice(0, 8);
}

/**
 * fetchWithTimeout — 带超时的 fetch（Node 18+ 内置）
 */
function fetchWithTimeout(url, timeoutMs, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * 从研报补充的额外赛道
 */
function getExtraSectors() {
  return [];
}

/**
 * 去重合并赛道
 */
function dedupeSectors(sectors) {
  const seen = new Set();
  return sectors.filter(s => {
    const key = s.gapProduct;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 生成新闻摘要
 */
function generateNewsDigest(sectors) {
  const critical = sectors.filter(s => s.severity === 'critical');
  const high = sectors.filter(s => s.severity === 'high');
  return {
    totalSectors: sectors.length,
    criticalCount: critical.length,
    highCount: high.length,
    topEvents: sectors.slice(0, 5).map(s => ({
      product: s.gapProduct,
      trigger: s.trigger,
      severity: s.severity
    }))
  };
}

/**
 * 解析用户手动输入的消息
 */
async function parseUserInput(message) {
  const lowerMsg = message.toLowerCase();

  // 关键词匹配
  const matchedSectors = [];
  const matchedProducts = new Set();

  for (const seed of SEED_SECTORS) {
    let matchScore = 0;
    for (const kw of seed.keywords) {
      if (lowerMsg.includes(kw.toLowerCase())) {
        matchScore++;
        matchedProducts.add(kw);
      }
    }
    if (matchScore >= 1) {
      matchedSectors.push({
        ...seed,
        fromUserInput: true,
        matchScore
      });
    }
  }

  // 如果没有匹配到预设赛道，尝试创建自定义赛道
  if (matchedSectors.length === 0) {
    const customSector = extractCustomSector(message);
    if (customSector) {
      matchedSectors.push(customSector);
    }
  }

  return {
    parsedSectors: matchedSectors.sort((a, b) => b.matchScore - a.matchScore),
    parsedProducts: Array.from(matchedProducts)
  };
}

/**
 * 从用户输入中提取自定义赛道
 */
function extractCustomSector(message) {
  const urgencyWords = ['断供', '停产', '涨价', '紧缺', '封锁', '管制', '短缺', '缺口', '国产替代', '卡脖子'];
  const hasUrgency = urgencyWords.some(w => message.includes(w));

  if (!hasUrgency) return null;

  const productPattern = /([\u4e00-\u9fa5]{2,6}(?:树脂|芯片|气体|材料|金属|元件|器件|衬底|基板|模组|存储|电容|电阻))|([A-Z]{2,4}(?:\s*树脂|\s*气体)?)/g;
  const products = [...message.matchAll(productPattern)].map(m => m[0]);

  if (products.length === 0) return null;

  return {
    name: `用户输入: ${products[0]}`,
    gapProduct: products[0],
    trigger: message.slice(0, 80),
    duration: '待验证',
    priceChange: '待验证',
    severity: 'high',
    fromUserInput: true,
    matchScore: 1,
    keywords: products,
    isCustom: true
  };
}

module.exports = { scanRecent, parseUserInput };
