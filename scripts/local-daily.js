#!/usr/bin/env node
/**
 * 市场猎手 · 自动选股管线
 * 
 * 由 GitHub Actions 定时触发（每个交易日 8:30 AM）
 * 零外部依赖 → 使用 Node.js 18+ 内置 fetch
 * 
 * 流程：
 *   Phase 1 → 公开 API 抓取供应链新闻
 *   Phase 2 → 关键词 → 赛道映射
 *   Phase 3 → 赛道 → 隐形冠军匹配（内置数据库）
 *   Phase 4 → 新浪 API 拉实时行情
 *   Phase 5 → 综合评分 → 输出 public/data/latest.json
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 内置冠军数据库（14 赛道 × N 标的）
// ============================================================
const CHAMPION_DB = [
  {
    sector: '钼金属（半导体级）',
    trigger: 'SK海力士375层NAND用钼替代钨',
    gapProduct: '半导体级钼',
    duration: '矿开3-5年',
    severity: 'high',
    kv: ['钼','钼金属','钼矿','NAND','SK海力士','375层','字线','钨替代','金钼','洛阳钼业'],
    champions: [
      { code: '601958', mkt: 'sh', name: '金钼股份',   title: '亚洲最大钼矿',     share: '国内钼资源绝对龙头',            score: 90 },
      { code: '603993', mkt: 'sh', name: '洛阳钼业',   title: '全球前五钼生产商', share: '多金属矿巨头',                  score: 86 }
    ]
  },
  {
    sector: 'MLCC 被动元器件',
    trigger: 'AI服务器MLCC用量8-12倍，高容涨50-60%',
    gapProduct: '高容MLCC',
    duration: '结构性长期',
    severity: 'high',
    kv: ['MLCC','高容','被动元件','村田','太阳诱电','电容','陶瓷电容','片式','三环','风华'],
    champions: [
      { code: '300408', mkt: 'sz', name: '三环集团',   title: '国产MLCC全球份额第一', share: '全球2.5%/粉体100%自给',    score: 86 },
      { code: '000636', mkt: 'sz', name: '风华高科',   title: '国内MLCC产能第一',     share: '月产能635亿只',               score: 72 }
    ]
  },
  {
    sector: 'PPE树脂→CCL→PCB',
    trigger: '沙特朱拜勒停产(全球70%PPE供应)',
    gapProduct: 'PPE树脂/高端覆铜板',
    duration: '至少至2027',
    severity: 'critical',
    kv: ['PPE','聚苯醚','树脂','沙特','朱拜勒','停产','覆铜板','CCL','PCB','生益','圣泉'],
    champions: [
      { code: '605589', mkt: 'sh', name: '圣泉集团',   title: 'PPE树脂国产唯一认证',  share: '国内头部CCL企业唯一供应商',   score: 86 },
      { code: '600183', mkt: 'sh', name: '生益科技',   title: '国内CCL龙头',          share: 'Q1净利+106%/高速CCL放量',     score: 83 },
      { code: '002916', mkt: 'sz', name: '深南电路',   title: 'AI服务器PCB龙头',      share: '高多层PCB国内领先',            score: 78 }
    ]
  },
  {
    sector: '存储芯片',
    trigger: 'CSP锁死2027-2028全部DRAM/NAND产能',
    gapProduct: '存储模组/DRAM/NAND',
    duration: '至2028',
    severity: 'critical',
    kv: ['存储','DRAM','NAND','HBM','CSP','锁死','产能','佰维','澜起','兆易'],
    champions: [
      { code: '688525', mkt: 'sh', name: '佰维存储',   title: '存储解决方案龙头',      share: '18.6亿美元长单锁至2028',      score: 82 },
      { code: '688008', mkt: 'sh', name: '澜起科技',   title: 'DDR5内存接口全球40%+', share: 'AI服务器DDR5量价齐升',         score: 76 },
      { code: '603986', mkt: 'sh', name: '兆易创新',   title: 'NOR Flash国内第一',    share: '全球前五/国内第一',             score: 72 }
    ]
  },
  {
    sector: '六氟化钨 WF6',
    trigger: '日企因钨出口管制或7月停产',
    gapProduct: '高纯6N/7N WF6',
    duration: '不确定',
    severity: 'high',
    kv: ['六氟化钨','WF6','钨','出口管制','日本','关东电化','中央硝子','中船特气'],
    champions: [
      { code: '688146', mkt: 'sh', name: '中船特气',   title: 'WF6国内龙头',          share: '电子特气品类齐全',             score: 48 }
    ]
  },
  {
    sector: '氦气',
    trigger: '卡塔尔+俄罗斯双断供(占中国进口98.6%)',
    gapProduct: '高纯氦气',
    duration: '至2027底',
    severity: 'critical',
    kv: ['氦气','氦','卡塔尔','俄罗斯','断供','提氦','九丰','广钢'],
    champions: [
      { code: '605090', mkt: 'sh', name: '九丰能源',   title: '国产提氦稀缺标的',      share: 'BOG提氦150万方/年',           score: 78 },
      { code: '688548', mkt: 'sh', name: '广钢气体',   title: '唯一多气源长协内资',    share: '近100个液氦冷箱/多地工厂',     score: 65 }
    ]
  },
  {
    sector: '磷化铟 光芯片',
    trigger: '光模块800G→1.6T，磷化铟衬底缺口>70%',
    gapProduct: 'InP衬底',
    duration: '长期',
    severity: 'medium',
    kv: ['磷化铟','InP','光芯片','光模块','800G','1.6T','云南锗业','衬底'],
    champions: [
      { code: '002428', mkt: 'sz', name: '云南锗业',   title: '磷化铟+锗全产业链',    share: '国内锗/InP龙头',              score: 65 }
    ]
  },
  {
    sector: 'CMP抛光液',
    trigger: '长鑫50-60亿美元设备采购优先国产',
    gapProduct: 'CMP抛光液/半导体材料',
    duration: '中长期',
    severity: 'medium',
    kv: ['CMP','抛光液','安集','长鑫','半导体材料','抛光'],
    champions: [
      { code: '688019', mkt: 'sh', name: '安集科技',   title: '国内CMP抛光液第一',    share: '28nm/14nm/7nm全制程覆盖',      score: 68 }
    ]
  },
  {
    sector: '电子布',
    trigger: 'AI需求→供给刚性→涨价117%',
    gapProduct: '低介电电子布',
    duration: '设备限制',
    severity: 'medium',
    kv: ['电子布','低介电','玻璃纤维','涨价'],
    champions: [
      { code: '600176', mkt: 'sh', name: '中国巨石',   title: '全球玻纤龙头',          share: '电子布产能全球领先',           score: 60 }
    ]
  },
  {
    sector: '光刻胶',
    trigger: '半导体材料全面涨价/国产替代加速',
    gapProduct: 'ArF光刻胶/MO源',
    duration: '长期',
    severity: 'medium',
    kv: ['光刻胶','ArF','MO源','南大光电','半导体材料','光刻'],
    champions: [
      { code: '300346', mkt: 'sz', name: '南大光电',   title: 'ArF光刻胶先行者',      share: 'MO源国内龙头',                 score: 50 }
    ]
  }
];

// ============================================================
// 新闻来源配置
// ============================================================
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
    url: () => `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2512&k=&num=30&page=1&r=${Date.now()}`,
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

// ============================================================
// Phase 1: 新闻抓取
// ============================================================
async function fetchAllNews() {
  console.log('[Phase 1] 开始抓取供应链新闻...');
  const allNews = [];

  for (const src of NEWS_SOURCES) {
    try {
      const url = src.url();
      console.log(`  请求: ${src.name} → ${url.substring(0,80)}...`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'MarketHunter/1.0 (GitHub Actions)',
          'Accept': 'application/json',
          'Referer': 'https://www.eastmoney.com/'
        }
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.log(`  ⚠️ ${src.name} HTTP ${res.status}`);
        continue;
      }

      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { 
        console.log(`  ⚠️ ${src.name} 非 JSON 响应`);
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

  console.log(`[Phase 1] 共计 ${unique.length} 条去重新闻\n`);
  return unique;
}

// ============================================================
// Phase 2: 新闻 → 赛道映射
// ============================================================
function mapNewsToSectors(news) {
  console.log('[Phase 2] 新闻 → 赛道映射...');
  const sectorHits = {};

  for (const item of news) {
    const txt = (item.title + ' ' + item.summary).toLowerCase();

    for (const sector of CHAMPION_DB) {
      let hits = 0;
      for (const kw of sector.kv) {
        if (txt.includes(kw.toLowerCase())) hits++;
      }
      if (hits >= 2) {
        if (!sectorHits[sector.sector]) {
          sectorHits[sector.sector] = { sector, news: [], score: 0 };
        }
        sectorHits[sector.sector].news.push(item);
        sectorHits[sector.sector].score += hits;
      }
    }
  }

  // 排序：命中新闻越多、关键词命中越多 → 越靠前
  const ranked = Object.values(sectorHits)
    .sort((a, b) => b.score - a.score);

  for (const r of ranked) {
    console.log(`  📌 ${r.sector}: ${r.news.length} 条新闻 / ${r.score} 分`);
  }

  if (ranked.length === 0) {
    console.log('  ⚠️ 今日无明确供应链新闻命中，返回全赛道');
    // fallback: 返回所有赛道
    return CHAMPION_DB.map(s => ({ sector: s, news: [], score: 0 }));
  }

  console.log(`[Phase 2] 命中 ${ranked.length} 个赛道\n`);
  return ranked;
}

// ============================================================
// Phase 3: 赛道 → 冠军匹配
// ============================================================
function matchChampions(rankedSectors) {
  console.log('[Phase 3] 赛道 → 冠军匹配...');
  const allMatches = [];

  for (const rs of rankedSectors) {
    const sector = rs.sector;
    for (const champ of sector.champions) {
      allMatches.push({
        ...champ,
        sectorName: sector.sector,
        trigger: sector.trigger,
        gapProduct: sector.gapProduct,
        duration: sector.duration,
        severity: sector.severity,
        newsCount: rs.news.length,
        newsScore: rs.score,
        newsSamples: rs.news.slice(0, 3).map(n => n.title)
      });
    }
  }

  // 去重（同一股票可能出现在多个赛道）
  const seen = new Set();
  const unique = allMatches.filter(m => {
    if (seen.has(m.code)) return false;
    seen.add(m.code);
    return true;
  });

  console.log(`[Phase 3] 匹配到 ${unique.length} 只冠军标的\n`);
  return unique;
}

// ============================================================
// Phase 4: 新浪行情 API
// ============================================================
async function fetchQuotes(champions) {
  console.log('[Phase 4] 拉取实时行情...');

  if (champions.length === 0) return new Map();

  const codes = champions.map(c => `${c.mkt}${c.code}`).join(',');
  const url = `http://hq.sinajs.cn/list=${codes}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MarketHunter/1.0',
        'Referer': 'https://finance.sina.com.cn/'
      }
    });
    clearTimeout(timeout);

    const text = await res.text();
    // 解析新浪格式: var hq_str_sh601958="金钼股份,25.52,25.50,..."
    const quotes = new Map();

    const regex = /hq_str_(sh|sz)(\d{6})="([^"]+)"/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const code = match[2];
      const fields = match[3].split(',');
      if (fields.length >= 32) {
        quotes.set(code, {
          name:     fields[0],
          open:     parseFloat(fields[1])  || 0,
          prevClose: parseFloat(fields[2]) || 0,
          price:    parseFloat(fields[3])  || 0,
          high:     parseFloat(fields[4])  || 0,
          low:      parseFloat(fields[5])  || 0,
          volume:   parseFloat(fields[8])  || 0,
          amount:   parseFloat(fields[9])  || 0,
          change:   ((parseFloat(fields[3]) - parseFloat(fields[2])) / parseFloat(fields[2]) * 100) || 0,
          date:     fields[30] || '',
          time:     fields[31] || ''
        });
      }
    }

    console.log(`  ✅ 成功获取 ${quotes.size} 只股票行情`);

    if (quotes.size === 0) {
      console.log('  ⚠️ 新浪API未返回数据，使用模拟数据');
      return null;
    }

    // 检查数据新鲜度：如果price都是0，说明市场未开盘
    const samplePrice = [...quotes.values()][0]?.price;
    if (!samplePrice || samplePrice === 0) {
      console.log('  ⚠️ 市场未开盘（行情为空），使用前一交易日数据');
    }

    console.log(`[Phase 4] 完成\n`);
    return quotes;
  } catch (e) {
    console.log(`  ❌ 新浪API错误: ${e.message}`);
    return null;
  }
}

// ============================================================
// Phase 5: 综合评分
// ============================================================
function scoreAndRank(champions, quotes) {
  console.log('[Phase 5] 综合评分排序...');
  const now = new Date();

  const results = champions.map(c => {
    const q = quotes ? quotes.get(c.code) : null;

    // 基础分（来自数据库）
    let baseScore = c.score || 60;

    // 新闻热度加成（0-10分）
    const newsBonus = Math.min(c.newsScore * 2, 10);

    // 行情加成（0-10分）：有实时行情 +5
    const quoteBonus = q && q.price > 0 ? 5 : 0;

    // 涨跌幅信号（-5 ~ +5）
    let trendBonus = 0;
    if (q && q.change) {
      if (q.change > 5) trendBonus = -3;      // 大涨可能是追高风险
      else if (q.change > 0) trendBonus = 2;  // 温和上涨
      else if (q.change < -5) trendBonus = -5; // 暴跌
      else if (q.change < 0) trendBonus = -1;  // 微跌
    }

    const finalScore = Math.round(Math.min(baseScore + newsBonus + quoteBonus + trendBonus, 100));

    return {
      code: c.code,
      name: c.name,
      sector: c.sectorName,
      title: c.title,
      share: c.share,
      trigger: c.trigger,
      gapProduct: c.gapProduct,
      duration: c.duration,
      severity: c.severity,
      score: finalScore,
      scoreBreakdown: {
        base: baseScore,
        news: newsBonus,
        quote: quoteBonus,
        trend: trendBonus
      },
      price: q?.price || null,
      change: q?.change ? +q.change.toFixed(2) : null,
      volume: q?.volume || null,
      quoteTime: q ? `${q.date} ${q.time}` : null,
      newsCount: c.newsCount,
      newsSamples: c.newsSamples || []
    };
  });

  // 排序
  results.sort((a, b) => b.score - a.score);

  // 取前10
  const top10 = results.slice(0, 10);

  console.log('\n🏆 最终排名:');
  top10.forEach((r, i) => {
    const p = r.price ? `¥${r.price}` : '--';
    const ch = r.change !== null ? `${r.change > 0 ? '+' : ''}${r.change}%` : '--';
    console.log(`  ${i+1}. ${r.name}(${r.code}) ${p} ${ch} | 得分:${r.score} | ${r.sector}`);
  });

  console.log(`[Phase 5] 完成\n`);
  return top10;
}

// ============================================================
// 输出 latest.json
// ============================================================
function outputJson(results, newsCount) {
  const output = {
    ts: new Date().toISOString(),
    date: new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    time: new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    pipeline: 'v2.0-auto',
    mode: 'scheduled',
    freshness: 'latest',
    dataSource: '新浪财经 + 东方财富',
    summary: {
      totalNews: newsCount,
      sectorsCovered: [...new Set(results.map(r => r.sector))].length,
      stocksSelected: results.length,
      avgScore: Math.round(results.reduce((a, r) => a + r.score, 0) / results.length)
    },
    results: results.map(r => ({
      rank: results.indexOf(r) + 1,
      code: r.code,
      name: r.name,
      sector: r.sector,
      title: r.title,
      share: r.share,
      trigger: r.trigger,
      gapProduct: r.gapProduct,
      duration: r.duration,
      severity: r.severity,
      score: r.score,
      scoreBreakdown: r.scoreBreakdown,
      price: r.price,
      change: r.change,
      volume: r.volume,
      quoteTime: r.quoteTime,
      newsCount: r.newsCount,
      newsSamples: r.newsSamples
    }))
  };

  const outPath = path.join(__dirname, '..', 'public', 'data', 'latest.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`📄 已写入: ${outPath}`);
  console.log(`📏 文件大小: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
  return output;
}

// ============================================================
// 主流程（本地版：失败也发通知，不 exit）
// ============================================================
async function main() {
  const startTime = Date.now();
  console.log('🦅 市场猎手 · 本地每日管线启动');
  console.log(`⏰ ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log('─'.repeat(50));

  let outputJson = null;
  let newsCount = 0, sectorCount = 0, resultCount = 0;
  let errorMsg = null;

  try {
    // Phase 1: 新闻抓取
    const news = await fetchAllNews();

    // Phase 2: 新闻 → 赛道
    const rankedSectors = mapNewsToSectors(news);

    // Phase 3: 赛道 → 冠军
    const champions = matchChampions(rankedSectors);

    // Phase 4: 行情
    const quotes = await fetchQuotes(champions);

    // Phase 5: 评分
    const results = scoreAndRank(champions, quotes);

    // 输出
    const jsonOut = outputJson(results, news.length);
    newsCount = news.length;
    sectorCount = rankedSectors.length;
    resultCount = results.length;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ 管线执行完成，耗时 ${elapsed}s`);
    console.log(`📊 ${news.length} 条新闻 → ${rankedSectors.length} 个赛道 → ${results.length} 只标的`);

  } catch (e) {
    errorMsg = e.message;
    console.error(`\n❌ 管线异常: ${e.message}`);
    console.error(e.stack);
  }

  // 无论成功失败都发通知
  if (errorMsg) {
    await sendNotificationError(errorMsg);
  } else {
    await sendNotification(jsonOut, newsCount, sectorCount, resultCount);
  }

  // 尝试 git push（忽略失败）
  try {
    const { execSync } = require('child_process');
    execSync('git add public/data/latest.json && git commit -m "🤖 本地每日更新" && git push', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('✅ git push 完成');
  } catch (e) {
    console.warn('⚠️ git push 失败（可忽略）:', e.message);
  }
}

main();

// ============================================================
// 通知推送 — 钉钉群机器人
// ============================================================
async function sendNotification(outputJson, newsCount, sectorCount, resultCount) {
  const webhook = process.env.DINGTALK_WEBHOOK;

  if (!webhook) {
    console.log('⚠️ 未配置 DINGTALK_WEBHOOK，跳过通知');
    return;
  }

  const keyword = process.env.DINGTALK_KEYWORD || '市场猎手';

  const now = new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'});

  // Top3 列表
  const top3 = (outputJson.results || []).slice(0, 3).map((r, i) =>
    `${['🥇','🥈','🥉'][i]} **${r.name}**(${r.code}) — ${r.score}分 | ${r.trigger || ''}`
  ).join('\n\n');

  // 钉钉 Markdown 消息（末尾追加关键词以满足安全设置）
  const markdown = `## 🦅 市场猎手 · 每日扫雷完成

📅 ${now}

📰 ${newsCount}条新闻 → ${sectorCount}个赛道 → ${resultCount}只标的

---

${top3}

---

[🔗 查看完整结果](https://a65c72634f914fa09ee79d3ad34e5885.app.codebuddy.work/standalone.html)

${keyword}`;

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: {
          title: keyword + ' · 市场猎手每日扫雷',
          text: markdown
        }
      })
    });
    const j = await res.json();
    if (j.errcode === 0) {
      console.log('📲 钉钉通知已发送');
    } else {
      console.warn('⚠️ 钉钉通知失败:', j.errmsg);
    }
  } catch (e) {
    console.warn('⚠️ 钉钉通知异常:', e.message);
  }
}

// ============================================================
// 失败通知
// ============================================================
async function sendNotificationError(errorMsg) {
  const webhook = process.env.DINGTALK_WEBHOOK;
  if (!webhook) return;

  const keyword = process.env.DINGTALK_KEYWORD || '市场猎手';
  const now = new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'});

  const markdown = `## ❌ 市场猎手 · 每日管线异常

📅 ${now}

**错误信息：**
\`\`\`
${errorMsg}
\`\`\`

[🔗 查看日志](https://github.com/tujinchi/market-hunter/actions)

${keyword}`;

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title: keyword + ' · 管线异常', text: markdown }
      })
    });
    const j = await res.json();
    if (j.errcode === 0) console.log('📲 钉钉异常通知已发送');
    else console.warn('⚠️ 钉钉通知失败:', j.errmsg);
  } catch (e) {
    console.warn('⚠️ 钉钉通知异常:', e.message);
  }
}
