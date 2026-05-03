import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';

const execFilePromise = util.promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function callPythonBridgeLocally(gameName: string) {
    try {
        // Point to the relocated script in /api
        const pythonScript = path.join(__dirname, 'api', 'hltb_bridge.py');

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

        if (lastError && !stdout) {
            console.error('[HLTB Local] Bridge execution failed:', lastError);
            return null;
        }

        const jsonMatch = stdout.match(/\{.*\}/s) || stdout.match(/null/);
        if (jsonMatch && jsonMatch[0] !== 'null') {
            return JSON.parse(jsonMatch[0]);
        }
        return null;
    } catch (error) {
        console.error('[HLTB Local] Exception:', error);
        return null;
    }
}

export async function getHLTBData(title: string) {
    if (!title) return null;

    // Use Vercel API only if explicitly in Vercel and configured
    if (process.env.VERCEL === '1' && process.env.VERCEL_URL) {
        try {
            const protocol = 'https';
            const host = process.env.VERCEL_URL;
            const url = `${protocol}://${host}/api/hltb_bridge?name=${encodeURIComponent(title)}`;

            const headers: Record<string, string> = {};
            if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
                headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
            }

            const response = await fetch(url, { headers });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error(`[HLTB Vercel Fetch] Error:`, error);
            return null;
        }
    }

    // Default to local execution (works in AI Studio and standard Node environments)
    return await callPythonBridgeLocally(title);
}