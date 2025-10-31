import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid share ID' });
  }

  try {
    if (req.method === 'GET') {
      // Get shared file (public access, no auth required)
      // This would fetch from IPFS using share ID lookup
      return res.status(200).json({
        shareId: id,
        message: 'Share access endpoint - fetch from IPFS using share ID'
      });
    }

    if (req.method === 'POST') {
      // Record share access
      const { password } = req.body;
      
      return res.status(200).json({
        success: true,
        shareId: id,
        message: 'Share access recorded'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

