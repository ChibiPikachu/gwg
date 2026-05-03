export async function getHLTBData(title) {
    try {
        const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
        const host = process.env.VERCEL_URL || 'localhost:3000';
        const url = `${protocol}://${host}/api/hltb_bridge?name=${encodeURIComponent(title)}`;

        console.log(`[HLTB DEBUG] Fetching from: ${url}`);

        // Attach the Vercel VIP pass to bypass the 401 Unauthorized block
        const headers = {};
        if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
            headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
        }

        const response = await fetch(url, { headers });
        const rawText = await response.text();

        if (!response.ok) {
            // This will print the actual Vercel error page text if it fails again
            console.error(`[HLTB DEBUG] Bad HTTP Status: ${response.status} - Body:`, rawText);
            return null;
        }

        if (!rawText || rawText === 'null') return { notFound: true };
        const data = JSON.parse(rawText);

        if (!data || data.error) {
            if (data?.error) console.error(`[HLTB DEBUG] Python Error:`, data.error);
            return { notFound: true };
        }

        return data;
    } catch (error) {
        console.error(`[HLTB DEBUG] Node JS Crash:`, error.message);
        return null;
    }
}