/**
 * 交叉匹配器 — Phase 3
 * 验证：冠军的主导产品是否正好是新闻中供给缺口的品类？
 */
function match(sector) {
  const champions = sector.champions || [];
  if (champions.length === 0) return [];

  const matches = [];

  for (const champ of champions) {
    const result = matchOne(sector, champ);
    if (result && result.matchScore >= 40) {
      matches.push(result);
    }
  }

  // 按匹配度排序
  matches.sort((a, b) => b.matchScore - a.matchScore);

  return matches;
}

function matchOne(sector, champ) {
  const gapProduct = sector.gapProduct;
  const champNotes = (champ.notes || '').toLowerCase();
  const champRank = (champ.rank || '').toLowerCase();

  let matchScore = 0;
  const matchReasons = [];
  const warnings = [];

  // 检查1：产品名称是否直接相关
  const gapKeywords = extractKeywords(gapProduct);
  let keywordHits = 0;
  for (const kw of gapKeywords) {
    if (champNotes.includes(kw) || champRank.includes(kw)) {
      keywordHits++;
    }
  }
  if (keywordHits >= 2) {
    matchScore += 40;
    matchReasons.push(`产品与缺口品类"${gapProduct}"直接相关`);
  } else if (keywordHits >= 1) {
    matchScore += 25;
    matchReasons.push(`产品与缺口品类部分相关`);
  } else {
    matchScore += 10;
    warnings.push('产品与缺口品类的直接关联需进一步验证');
  }

  // 检查2：市占率/冠军纯度
  const sharePct = champ.sharePct || '';
  if (sharePct.includes('唯一') || sharePct.includes('稀缺')) {
    matchScore += 30;
    matchReasons.push('该产品国产唯一/稀缺供应商');
  } else if (sharePct.includes('第一') || sharePct.includes('龙头') || sharePct.includes('领先')) {
    matchScore += 25;
    matchReasons.push(`国内${champ.rank}`);
  } else {
    matchScore += 10;
  }

  // 检查3：冠军纯度分
  const purity = champ.purity || 50;
  if (purity >= 90) {
    matchScore += 20;
    matchReasons.push('冠军纯度极高（产品高度聚焦）');
  } else if (purity >= 70) {
    matchScore += 12;
  } else {
    matchScore += 5;
    warnings.push('冠军纯度偏低，产品线分散');
  }

  // 检查4：是否有公司自我澄清/负面信号
  if (champNotes.includes('澄清') || champNotes.includes('无新增')) {
    matchScore -= 25;
    warnings.push('⚠️ 公司已澄清无新增大额订单');
  }

  // 检查5：是否是纯代理商
  if (champNotes.includes('分销') || champNotes.includes('代理') || champNotes.includes('外采')) {
    matchScore -= 20;
    warnings.push('⚠️ 公司为分销商/代理商，非自主生产者');
  }

  // 检查6：粉体/上游自给
  if (champNotes.includes('自给') || champNotes.includes('自主')) {
    matchScore += 10;
    matchReasons.push('上游原材料自主可控');
  }

  return {
    code: champ.code,
    name: champ.name,
    market: champ.market,
    rank: champ.rank,
    sharePct: champ.sharePct,
    sectorName: sector.name,
    gapProduct: sector.gapProduct,
    matchScore: Math.min(100, Math.max(0, matchScore)),
    matchReasons,
    warnings,
    championPurity: purity
  };
}

function extractKeywords(product) {
  // 提取产品关键词
  const cleaned = product
    .replace(/[（(].*?[)）]/g, '')
    .replace(/高纯|国产|进口|半导体级/g, '')
    .trim();

  const words = [];
  // 英文缩写
  const engMatches = cleaned.match(/[A-Z]{2,6}/g);
  if (engMatches) words.push(...engMatches.map(w => w.toLowerCase()));

  // 中文关键词
  const cnMatches = cleaned.match(/[\u4e00-\u9fa5]{2,4}/g);
  if (cnMatches) words.push(...cnMatches);

  return words;
}

module.exports = { match };
