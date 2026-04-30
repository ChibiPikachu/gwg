import { HowLongToBeatService, HowLongToBeatEntry } from 'howlongtobeat';

const hltbService = new HowLongToBeatService();

// 1. Advanced Cleaner (Removes trademarks, punctuation, and trailing years)
function cleanNameForHLTB(name: string) {
  let clean = name.replace(/[®™©]/g, '');
  clean = clean.replace(/\s*\(\d{4}\)\s*$/g, '');
  clean = clean.replace(/[^\w\s]/g, ' ');
  clean = clean.replace(/\s{2,}/g, ' ');
  return clean.trim();
}

// 2. Edition Stripper (Removes "Game of the Year", "Definitive", etc.)
function stripEditionForHLTB(name: string) {
  const qualifiers = 'definitive|remastered|hd remaster|hd edition|game of the year|goty|complete|ultimate|enhanced|special|anniversary|directors? cut|deluxe|gold|platinum|standard|extended|legendary';
  const editionRegex = new RegExp(`\\s+(?:${qualifiers})(?:\\s+(?:edition|version|cut))?\\s*$`, 'i');
  return name.replace(editionRegex, '').trim();
}

export async function getHLTBData(title: string) {
  try {
    const searchName = cleanNameForHLTB(title);
    
    let results = await hltbService.search(searchName);
    
    // Fallback 1: Strip the "Edition" and try again
    if (results.length === 0) {
      const noEditionName = stripEditionForHLTB(searchName);
      if (noEditionName !== searchName) {
        results = await hltbService.search(noEditionName);
      }
    }

    // Fallback 2: Colon-Splitter
    if (results.length === 0 && title.includes(':')) {
      const splitTitle = cleanNameForHLTB(title.split(':')[0]);
      results = await hltbService.search(splitTitle);
    }
    
    if (results.length > 0) {
      // Find the best match (closest title)
      const best = results[0]; 
      return {
        hastily: best.gameplayMain ? `${best.gameplayMain} Hours` : '--',
        normally: best.gameplayMainExtra ? `${best.gameplayMainExtra} Hours` : '--',
        completionist: best.gameplayCompletionist ? `${best.gameplayCompletionist} Hours` : '--',
        mainTime: best.gameplayMain || 0 // Numeric value for calculation
      };
    }
    
    return null;
  } catch (error) {
    console.error(`[HLTB Service] Search failed for ${title}:`, error);
    return null;
  }
}
