import dotenv from 'dotenv';

dotenv.config();

const toBool = (value) => String(value).toLowerCase() === 'true';

export const config = {
  port: Number(process.env.PORT || 5000),
  host: process.env.HOST || '127.0.0.1',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  mongoUri: process.env.MONGO_URI || '',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-me',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: toBool(process.env.SMTP_SECURE || false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  mail: {
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@example.com'
  }
};
