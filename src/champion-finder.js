/**
 * 冠军筛选器 — Phase 2
 * 每赛道系统性筛选隐形冠军/单项冠军
 * 不看价格，只看市占率数据
 */
const CHAMPION_DATABASE = {
  // PPE树脂
  'PPE树脂': [
    { code: '605589', name: '圣泉集团', market: 'SH', rank: '国产唯一通过头部CCL认证', share: 'PPE树脂国产唯一', sharePct: '唯一', notes: '碳氢树脂同步具备，合成树脂平台型公司', purity: 95 },
    { code: '002669', name: '康达新材', market: 'SZ', rank: '环氧树脂龙头', share: '环氧国产前三', sharePct: '~8%', notes: '环氧为主，PPE在研', purity: 50 }
  ],
  // CCL覆铜板
  'CCL覆铜板': [
    { code: '600183', name: '生益科技', market: 'SH', rank: '国内CCL龙头', share: '国内市占率第一', sharePct: '~15%', notes: 'Q1净利+106%，高速CCL放量', purity: 92 },
    { code: '603186', name: '华正新材', market: 'SH', rank: '高频高速CCL', share: '高频CCL国内领先', sharePct: '~5%', notes: '5G/数据中心CCL', purity: 70 }
  ],
  // MLCC
  'MLCC': [
    { code: '300408', name: '三环集团', market: 'SZ', rank: '国产MLCC全球份额第一', share: '全球2.5%，国产最高', sharePct: '2.5%', notes: '粉体100%自给，毛利率42%，高容占30%', purity: 98 },
    { code: '000636', name: '风华高科', market: 'SZ', rank: '产能国产第一', share: '月产能635亿只', sharePct: '1.9%', notes: '粉体外购，毛利率16%，高容10-15%', purity: 80 },
    { code: '301389', name: '达利凯普', market: 'SZ', rank: '射频微波MLCC冠军', share: '该细分国内第一', sharePct: '细分领先', notes: '射频微波细分赛道', purity: 75 }
  ],
  // 钼金属
  '钼金属': [
    { code: '601958', name: '金钼股份', market: 'SH', rank: '亚洲最大钼矿', share: '金堆城钼矿，国内钼资源龙头', sharePct: '领先', notes: 'PE 24x，钼矿储量亚洲第一', purity: 98 },
    { code: '603993', name: '洛阳钼业', market: 'SH', rank: '全球前五钼生产商', share: '全球多金属矿巨头', sharePct: '全球前五', notes: '钼+铜+钴多金属，PE仅17x', purity: 85 }
  ],
  // 存储芯片
  '存储芯片': [
    { code: '688525', name: '佰维存储', market: 'SH', rank: '存储模组龙头', share: '国内存储解决方案龙头', sharePct: '领先', notes: '18.6亿美元长单锁至2028', purity: 93 },
    { code: '688008', name: '澜起科技', market: 'SH', rank: 'DDR5接口芯片全球领先', share: '全球~40%', sharePct: '40%', notes: '内存接口芯片全球三强', purity: 90 },
    { code: '603986', name: '兆易创新', market: 'SH', rank: 'NOR Flash国内第一', share: '国内第一，全球前五', sharePct: '~15%', notes: 'NOR Flash+MCU双龙头', purity: 88 }
  ],
  // 六氟化钨WF6
  'WF6': [
    { code: '688146', name: '中船特气', market: 'SH', rank: 'WF6国内龙头', share: '国内高纯WF6主要供应商', sharePct: '领先', notes: '⚠️公司澄清无新增大额订单', purity: 70 },
    { code: '688268', name: '华特气体', market: 'SH', rank: '电子特气品类最全', share: '电子特气品种最多', sharePct: '分散', notes: '品类大而全，单品类不突出', purity: 55 }
  ],
  // 氦气
  '氦气': [
    { code: '605090', name: '九丰能源', market: 'SH', rank: '国产提氦稀缺标的', share: 'BOG提氦150万方/年', sharePct: '稀缺', notes: '自主提氦，PE 18.7x', purity: 90 },
    { code: '688548', name: '广钢气体', market: 'SH', rank: '唯一多气源长协内资', share: '国内唯一多气源长期协议', sharePct: '领先', notes: '近百个液氦冷箱，智能化工厂', purity: 88 }
  ],
  // 磷化铟
  '磷化铟': [
    { code: '002428', name: '云南锗业', market: 'SZ', rank: '锗全产业链+磷化铟', share: '国内锗龙头，磷化铟在研', sharePct: '领先', notes: '磷化铟供需缺口>70%', purity: 65 }
  ],
  // 电子布
  '电子布': [
    { code: '600176', name: '中国巨石', market: 'SH', rank: '全球玻纤龙头', share: '全球最大玻纤生产商', sharePct: '~20%', notes: '电子布+风电纱双主线', purity: 80 }
  ],
  // PCB
  'PCB': [
    { code: '002916', name: '深南电路', market: 'SZ', rank: 'AI服务器高多层PCB龙头', share: '高多层PCB国内领先', sharePct: '领先', notes: '华为核心供应商', purity: 85 },
    { code: '603228', name: '景旺电子', market: 'SH', rank: '汽车+AI服务器PCB', share: '汽车PCB龙头', sharePct: '领先', notes: '车规+服务器双轮驱动', purity: 75 }
  ]
};

/**
 * 根据赛道关键词模糊匹配冠军数据库
 */
function findChampions(sector) {
  const gapProduct = sector.gapProduct;
  const sectorName = sector.name;

  // 精确匹配
  for (const [key, champions] of Object.entries(CHAMPION_DATABASE)) {
    if (gapProduct.includes(key) || sectorName.includes(key) || key.includes(gapProduct)) {
      return champions.map(c => ({ ...c, source: 'champion-db' }));
    }
  }

  // 模糊匹配
  for (const [key, champions] of Object.entries(CHAMPION_DATABASE)) {
    if (gapProduct.split('').some(c => key.includes(c)) && key.length > 1) {
      return champions.map(c => ({ ...c, source: 'champion-db-fuzzy' }));
    }
  }

  // 无匹配 → 返回空（不随便推荐）
  return [];
}

/**
 * 为自定义用户输入赛道搜索冠军
 */
async function searchChampionsByKeywords(keywords) {
  const results = [];
  for (const kw of keywords) {
    for (const [key, champions] of Object.entries(CHAMPION_DATABASE)) {
      if (key.includes(kw) || kw.includes(key)) {
        results.push(...champions);
      }
    }
  }
  return [...new Map(results.map(c => [c.code, c])).values()];
}

module.exports = { findChampions, searchChampionsByKeywords, CHAMPION_DATABASE };
