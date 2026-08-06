import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { titles } = req.body;

    if (!Array.isArray(titles)) {
      return res.status(400).json({ error: 'Titles array required' });
    }

    // Map through titles and query your HLTB service/database
    const results: Record<string, { hltb_main: number; hltb_extras: number; hltb_completionist: number }> = {};

    for (const title of titles) {
      // Mock/Fallback structure or call your internal hltb utility function here
      results[title] = {
        hltb_main: 10,
        hltb_extras: 15,
        hltb_completionist: 25
      };
    }

    return res.status(200).json(results);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed batch HLTB lookup' });
  }
}