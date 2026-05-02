// lib/hltb.js
export async function getHLTBData(gameName, threshold = 75) {
    try {
        // Determine the base URL (Vercel provides VERCEL_URL in production)
        const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
        const host = process.env.VERCEL_URL || 'localhost:3000';

        const url = `${protocol}://${host}/api/hltb_bridge?name=${encodeURIComponent(gameName)}&threshold=${threshold}`;

        const response = await fetch(url);

        if (!response.ok) {
            console.error(`HLTB Bridge error: ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Failed to fetch from HLTB Python Bridge:", error);
        return null;
    }
}