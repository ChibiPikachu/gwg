// lib/hltb.js
export async function getHLTBData(title) {
    try {
        console.log(`[HLTB] Requesting data for: "${title}"`);

        // Use a relative path! The browser will automatically prepend the correct domain.
        const response = await fetch(`/api/hltb_bridge?name=${encodeURIComponent(title)}`);

        if (!response.ok) {
            console.error(`[HLTB] Bridge responded with status: ${response.status}`);
            return null;
        }

        const data = await response.json();

        if (data) {
            console.log(`[HLTB] Success for "${title}"`);
            return data;
        }

        return null;
    } catch (error) {
        console.error(`[HLTB] Fetch failed for ${title}:`, error.message);
        return null;
    }
}