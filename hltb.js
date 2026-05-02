// lib/hltb.js
export async function getHLTBData(title) {
    try {
        // Vercel provides the VERCEL_URL environment variable automatically
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000';

        console.log(`[HLTB] Requesting data for: "${title}"`);

        const response = await fetch(`https://${process.env.VERCEL_URL}/api/hltb?name=${encodeURIComponent(title)}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("HLTB Fetch Error:", error);
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