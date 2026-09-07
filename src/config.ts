import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  dataDir: DATA_DIR,
  dbPath: process.env.DATABASE_PATH || path.join(DATA_DIR, 'gateway.db'),
  defaultProxyUrl: process.env.PROXY_URL || '',
  defaultGatewayToken: process.env.GATEWAY_TOKEN || '',
  defaultAdminPassword: process.env.ADMIN_PASSWORD || '',
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
};
