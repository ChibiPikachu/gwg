import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';

// Change from exec to execFile
const execFilePromise = util.promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Silently calls our Python bridge script in the background
async function callPythonBridge(gameName) {
    try {
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const response = await fetch(`${baseUrl}/api/hltb?name=${encodeURIComponent(gameName)}`);

        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("Bridge fetch failed:", error);
        return null;
    }
    const pythonScript = path.join(__dirname, 'hltb.py');

    // execFile passes arguments as an array, completely neutralizing shell injection risks.
    // We no longer need to manually escape quotes!
    // Try both python3 and python
    const cmds = ['python3', 'python'];
    let stdout = '';
    let lastError = null;

    for (const cmd of cmds) {
        try {
            const result = await execFilePromise(cmd, [pythonScript, gameName]);
            stdout = result.stdout;
            lastError = null;
            break;
        } catch (err) {
            lastError = err;
        }
    }

    if (lastError && !stdout) return null;

    // Find the JSON object in the output, ignoring any Python warnings
    const jsonMatch = stdout.match(/\{.*\}/s) || stdout.match(/null/);
    if (jsonMatch && jsonMatch[0] !== 'null') {
        return JSON.parse(jsonMatch[0]);
    }
    return null;
} catch (error) {
    return null;
}
}

export async function getHLTBData(title) {
    try {
        const searchName = cleanGameTitle(title);
        console.log(`[HLTB Bridge] Searching for: "${searchName}"`);

        let results = await callPythonBridge(searchName);

        // Fallback 1: Strip the "Edition" and try again
        if (!results) {
            const noEditionName = stripEditionForHLTB(searchName);
            if (noEditionName !== searchName) {
                console.log(`[HLTB Bridge] Attempting Edition-Stripped search for: "${noEditionName}"`);
                results = await callPythonBridge(noEditionName);
            }
        }

        // Fallback 2: Your original Colon-Splitter
        if (!results && title.includes(':')) {
            const splitTitle = cleanGameTitle(title.split(':')[0]);
            console.log(`[HLTB Bridge] Attempting Colon-Split search for: "${splitTitle}"`);
            results = await callPythonBridge(splitTitle);
        }

        if (results) {
            console.log(`[HLTB Bridge] Success! Scraped accurate times via Python!`);
            return results;
        }

        console.log(`[HLTB Bridge] No match found for "${title}".`);
        return null;
    } catch (error) {
        console.error(`[HLTB Bridge] Search failed for ${title}: ${error.message}`);
        return null;
    }
}
