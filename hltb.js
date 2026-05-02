import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Advanced Cleaner (Removes trademarks, punctuation, and trailing years)
function cleanGameTitle(title) {
    if (!title) return '';
    let clean = title.replace(/[®™©]/g, '');
    clean = clean.replace(/\s*\(\d{4}\)\s*$/g, '');
    clean = clean.replace(/[^\w\s]/g, ' ');
    clean = clean.replace(/\s{2,}/g, ' ');
    return clean.trim();
}

// Edition Stripper
function stripEditionForHLTB(name) {
    const qualifiers = 'definitive|remastered|hd remaster|hd edition|game of the year|goty|complete|ultimate|enhanced|special|anniversary|directors? cut|deluxe|gold|platinum|standard|extended|legendary';
    const editionRegex = new RegExp(`\\s+(?:${qualifiers})(?:\\s+(?:edition|version|cut))?\\s*$`, 'i');
    return name.replace(editionRegex, '').trim();
}

// HLTB Scraping Logic
let hltbSearchKey = null;
let lastKeyFetch = 0;

async function getSearchKey() {
    // Cache the key for 1 hour
    if (hltbSearchKey && Date.now() - lastKeyFetch < 3600000) {
        return hltbSearchKey;
    }

    try {
        console.log('[HLTB] Fetching fresh search key...');
        const response = await fetch('https://howlongtobeat.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            }
        });
        const html = await response.text();

        // Find the _app-xxxx.js script tag
        const scriptMatch = html.match(/_next\/static\/chunks\/pages\/_app-([^.]+)\.js/);
        if (!scriptMatch) {
            // Fallback: try to find it in any chunk
            const chunks = html.match(/_next\/static\/chunks\/[^"]+\.js/g);
            if (!chunks) throw new Error('Could not find any scripts');

            for (const chunk of chunks) {
                const url = `https://howlongtobeat.com/${chunk}`;
                const res = await fetch(url);
                const js = await res.text();
                const keyMatch = js.match(/\.concat\("\/api\/search\/"\)\.concat\("([^"]+)"\)/);
                if (keyMatch) {
                    hltbSearchKey = keyMatch[1];
                    lastKeyFetch = Date.now();
                    return hltbSearchKey;
                }
            }
            throw new Error('Key not found in any chunks');
        }

        const scriptUrl = `https://howlongtobeat.com/_next/static/chunks/pages/_app-${scriptMatch[1]}.js`;
        const scriptRes = await fetch(scriptUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            }
        });
        const script = await scriptRes.text();

        // Find the search key in the script
        const keyMatch = script.match(/\.concat\("\/api\/search\/"\)\.concat\("([^"]+)"\)/) ||
            script.match(/\/api\/search\/([^"']+)/);
        if (keyMatch) {
            hltbSearchKey = (keyMatch[1] as string).split('"')[0].split("'")[0];
            lastKeyFetch = Date.now();
            console.log('[HLTB] Found search key:', hltbSearchKey);
            return hltbSearchKey;
        }

        throw new Error('Key not found in app script');
    } catch (error) {
        console.error('[HLTB] Failed to get search key:', error.message);
        return null;
    }
}

async function scrapeHLTB(gameName) {
    try {
        const key = await getSearchKey();
        if (!key) return null;

        const url = `https://howlongtobeat.com/api/search/${key}`;
        const searchPayload = {
            searchType: "games",
            searchTerms: [gameName],
            searchPage: 1,
            size: 20,
            searchOptions: {
                games: {
                    userId: 0,
                    platform: "",
                    sortCategory: "popular",
                    rangeCategory: "main",
                    rangeTime: { min: 0, max: 0 },
                    gameplay: { perspective: "", flow: "", genre: "" },
                    modifier: ""
                },
                users: { sortCategory: "postcount" },
                lists: { sortCategory: "follows" },
                filter: "",
                sort: 0,
                randomizer: 0
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Referer': 'https://howlongtobeat.com/',
                'Origin': 'https://howlongtobeat.com'
            },
            body: JSON.stringify(searchPayload)
        });

        if (!response.ok) {
            console.error('[HLTB] Search failed status:', response.status);
            // If 404/403, key might be stale
            if (response.status === 404 || response.status === 403) hltbSearchKey = null;
            return null;
        }

        const data = await response.json();
        if (data && data.data && data.data.length > 0) {
            // Find the best match (closest name) - for now just first result
            const result = data.data[0];

            const formatTime = (seconds) => {
                if (!seconds || seconds <= 0) return "0";
                return Math.round(seconds / 3600).toString();
            };

            return {
                hastily: formatTime(result.comp_main),
                normally: formatTime(result.comp_plus),
                completionist: formatTime(result.comp_100),
                id: result.game_id,
                name: result.game_name
            };
        }
        return null;
    } catch (error) {
        console.error('[HLTB] Scraping error:', error.message);
        return null;
    }
}

export async function getHLTBData(title) {
    try {
        const searchName = cleanGameTitle(title);
        console.log(`[HLTB] Requesting: "${searchName}"`);

        let results = await scrapeHLTB(searchName);

        // Fallback 1: Strip Edition
        if (!results) {
            const noEditionName = stripEditionForHLTB(searchName);
            if (noEditionName !== searchName) {
                console.log(`[HLTB] Trying edition-stripped: "${noEditionName}"`);
                results = await scrapeHLTB(noEditionName);
            }
        }

        // Fallback 2: Colon Split
        if (!results && title.includes(':')) {
            const splitTitle = cleanGameTitle(title.split(':')[0]);
            console.log(`[HLTB] Trying split: "${splitTitle}"`);
            results = await scrapeHLTB(splitTitle);
        }

        return results;
    } catch (error) {
        console.error(`[HLTB] Exception for ${title}:`, error);
        return null;
    }
}
