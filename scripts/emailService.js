// scripts/emailService.js
// Sends the tunnel URL email via SMTP (Gmail app password by default).
// Required env: MAIL_USER, MAIL_APP_PASSWORD, MAIL_TO
// Optional: MAIL_HOST (default smtp.gmail.com), MAIL_PORT (default 587),
//           MAIL_FROM (default MAIL_USER), MAIL_TIMEOUT_MS (default 20000),
//           MAIL_ALLOW_INSECURE_TLS=1 to disable TLS cert checks (opt-in only)

const nodemailer = require('nodemailer');
const { buildEmailHtml } = require('./emailTemplate');

const DEFAULTS = {
  host: 'smtp.gmail.com',
  port: 587,
  timeoutMs: 20000,
};

function readConfig() {
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_APP_PASSWORD;
  const to = process.env.MAIL_TO;
  const missing = [
    ['MAIL_USER', user],
    ['MAIL_APP_PASSWORD', pass],
    ['MAIL_TO', to],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing email env vars: ${missing.join(', ')}`);
  }
  const port = Number(process.env.MAIL_PORT || DEFAULTS.port);
  return {
    host: process.env.MAIL_HOST || DEFAULTS.host,
    port,
    user,
    pass,
    to,
    from: process.env.MAIL_FROM || user,
    timeoutMs: Number(process.env.MAIL_TIMEOUT_MS || DEFAULTS.timeoutMs),
    allowInsecureTls: process.env.MAIL_ALLOW_INSECURE_TLS === '1',
  };
}

async function sendEmail({ url, adminUrl, subject, when }) {
  const cfg = readConfig();
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: cfg.port !== 465,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: cfg.timeoutMs,
    greetingTimeout: cfg.timeoutMs,
    socketTimeout: cfg.timeoutMs,
    tls: cfg.allowInsecureTls ? { rejectUnauthorized: false } : undefined,
  });

  if (process.env.NODE_ENV !== 'production') {
    await transporter.verify();
  }

  await transporter.sendMail({
    from: `"ChatApp Tunnel" <${cfg.from}>`,
    to: cfg.to,
    subject: subject || `Dev tunnel: ${url}`,
    html: buildEmailHtml({ url, adminUrl, when }),
  });
}

module.exports = { sendEmail };
