export async function getHLTBData(title) {
    try {
        // Node.js fetch MUST have the full absolute URL
        const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
        const host = process.env.VERCEL_URL || 'localhost:3000';

        const url = `${protocol}://${host}/api/hltb_bridge?name=${encodeURIComponent(title)}`;
        console.log(`[HLTB] Requesting data for: "${title}"`);

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`[HLTB] Bridge responded with status: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data) {
            return data;
        }
        return null;
    } catch (error) {
        console.error(`[HLTB] Fetch failed for ${title}:`, error.message);
        return null;
    }
}