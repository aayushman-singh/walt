import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAuthToken } from '../../../lib/apiAuth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify authentication
  const user = await verifyAuthToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid file ID' });
  }

  try {
    if (req.method === 'POST') {
      // Pin file
      const { ipfsUri } = req.body;
      
      if (!ipfsUri) {
        return res.status(400).json({ error: 'Missing ipfsUri' });
      }

      // Call pinning service
      // This would integrate with Pinata API
      return res.status(200).json({
        success: true,
        message: 'File pinned',
        fileId: id,
        ipfsUri
      });
    }

    if (req.method === 'DELETE') {
      // Unpin file
      const { ipfsUri } = req.body;
      
      if (!ipfsUri) {
        return res.status(400).json({ error: 'Missing ipfsUri' });
      }

      // Call unpinning service
      return res.status(200).json({
        success: true,
        message: 'File unpinned',
        fileId: id,
        ipfsUri
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

