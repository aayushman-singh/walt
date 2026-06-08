import { create } from 'ipfs-http-client';
import multer from 'multer';

const ipfsUrl = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
const ipfs = create({ url: ipfsUrl });

export const upload = multer({ dest: '/tmp' });

export default ipfs;
