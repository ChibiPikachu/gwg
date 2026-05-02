import { HowLongToBeatService } from 'howlongtobeat';

const hltbService = new HowLongToBeatService();

// 1. Advanced Cleaner (Removes trademarks, punctuation, and trailing years)
function cleanGameTitle(title) {
    if (!title) return '';
    let clean = title.replace(/[®™©]/g, '');
    clean = clean.replace(/\s*\(\d{4}\)\s*$/g, '');
    clean = clean.replace(/[^\w\s]/g, ' ');
    clean = clean.replace(/\s{2,}/g, ' ');
    return clean.trim();
}

// 2. Edition Stripper (Removes "Game of the Year", "Definitive", etc.)
function stripEditionForHLTB(name) {
    const qualifiers = 'definitive|remastered|hd remaster|hd edition|game of the year|goty|complete|ultimate|enhanced|special|anniversary|directors? cut|deluxe|gold|platinum|standard|extended|legendary';
    const editionRegex = new RegExp(`\\s+(?:${qualifiers})(?:\\s+(?:edition|version|cut))?\\s*$`, 'i');
    return name.replace(editionRegex, '').trim();
}

async function searchHLTB(gameName) {
    try {
        const results = await hltbService.search(gameName);
        if (results && results.length > 0) {
            // Find the best match (howlongtobeat package already sorts by relevance usually, but we take the first)
            const best = results[0];
            return {
                hastily: String(best.gameplayMain || 0),
                normally: String(best.gameplayMainExtra || 0),
                completionist: String(best.gameplayCompletionist || 0),
                id: best.id,
                name: best.name
            };
        }
        return null;
    } catch (error) {
        console.error(`HLTB Search Error for ${gameName}:`, error);
        return null;
    }
}

export async function getHLTBData(title) {
    try {
        const searchName = cleanGameTitle(title);
        console.log(`[HLTB] Searching for: "${searchName}"`);

        let results = await searchHLTB(searchName);

        // Fallback 1: Strip the "Edition" and try again
        if (!results) {
            const noEditionName = stripEditionForHLTB(searchName);
            if (noEditionName !== searchName) {
                console.log(`[HLTB] Attempting Edition-Stripped search for: "${noEditionName}"`);
                results = await searchHLTB(noEditionName);
            }
        }

        // Fallback 2: Colon-Splitter
        if (!results && title.includes(':')) {
            const splitTitle = cleanGameTitle(title.split(':')[0]);
            console.log(`[HLTB] Attempting Colon-Split search for: "${splitTitle}"`);
            results = await searchHLTB(splitTitle);
        }

        if (results) {
            console.log(`[HLTB] Success! Found data for "${results.name}": Main=${results.hastily}h, Comp=${results.completionist}h`);
            return results;
        }

        console.log(`[HLTB] No match found for "${title}".`);
        return null;
    } catch (error) {
        console.error(`[HLTB] Search failed for ${title}: ${error.message}`);
        return null;
    }
}
