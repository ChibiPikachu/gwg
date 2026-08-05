import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HowLongToBeatService } from 'howlongtobeat';

const hltbService = new HowLongToBeatService();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query.q as string || req.body?.q;
  if (!query) {
    return res.status(400).json({ error: 'Search query "q" is required' });
  }

  try {
    const results = await hltbService.search(query);
    return res.status(200).json({ results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to query HLTB' });
  }
}