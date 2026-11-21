// scripts/tunnel-mail.mjs
// Cloudflare Tunnel orchestrator.
// 1. Spawns `cloudflared tunnel --url localhost:<port>`
// 2. Scrapes the *.trycloudflare.com URL from its output
// 3. Verifies the URL responds, then emails it via scripts/emailService.js
// 4. Health-monitors the local server; kills the tunnel if it stays down
// 5. SIGINT/SIGTERM kills cloudflared cleanly
//
// Usage:
//   pnpm tunnel              # tunnel + email (needs MAIL_* env vars)
//   pnpm tunnel:raw          # tunnel only, prints URL, no email
//   TUNNEL_PORT=3000 pnpm tunnel   # override port (default 4000)
//   node scripts/tunnel-mail.mjs --port 3000 --no-mail
//
// Env (see .env.tunnel.example): MAIL_USER, MAIL_APP_PASSWORD, MAIL_TO,
//   optional MAIL_HOST/MAIL_PORT/MAIL_FROM/MAIL_TIMEOUT_MS.
// Health check: TUNNEL_HEALTH_PATH (default /health), TUNNEL_HEALTH_INTERVAL_MS
//   (default 5000), TUNNEL_HEALTH_MAX_FAILURES (default 3), TUNNEL_HEALTH=0 disables.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// Load env files if present (.env.local is gitignored; never commit secrets)
for (const f of ['.env.local', '.env.tunnel']) {
  try {
    process.loadEnvFile?.(f);
  } catch {
    // file missing or unsupported — env may already be set externally
  }
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : fallback;
};

const PORT = Number(opt('--port', process.env.TUNNEL_PORT || 4000));
const NO_MAIL = flag('--no-mail');
const LOCAL_URL = `http://localhost:${PORT}`;
const HEALTH_PATH = process.env.TUNNEL_HEALTH_PATH || '/health';
const HEALTH_INTERVAL = Number(process.env.TUNNEL_HEALTH_INTERVAL_MS || 5000);
const HEALTH_MAX_FAILURES = Number(process.env.TUNNEL_HEALTH_MAX_FAILURES || 3);
const HEALTH_ENABLED = process.env.TUNNEL_HEALTH !== '0';

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  console.error(`Invalid port: ${PORT}`);
  process.exit(1);
}

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;

let cloudflared = null;
let shuttingDown = false;
let healthTimer = null;
let consecutiveFailures = 0;

function killTunnel(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 ${reason}`);
  if (healthTimer) clearInterval(healthTimer);
  cloudflared?.kill('SIGTERM');
  // Windows: SIGTERM may not propagate; force after grace period
  setTimeout(() => cloudflared?.kill('SIGKILL'), 3000).unref();
  setTimeout(() => process.exit(0), 3500).unref();
}

process.on('SIGINT', () => killTunnel('Interrupted — tunnel stopped.'));
process.on('SIGTERM', () => killTunnel('Terminated — tunnel stopped.'));

function startCloudflared() {
  // The cloudflared npm package downloads the real binary to bin/ — spawn it
  // directly (real .exe on Windows, no shell/.cmd shim needed).
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const binPath = fileURLToPath(
    new URL(`../node_modules/cloudflared/bin/${exe}`, import.meta.url)
  );
  cloudflared = spawn(
    binPath,
    ['tunnel', '--url', LOCAL_URL, '--no-autoupdate'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const onData = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const match = text.match(URL_RE);
    if (match) {
      const url = match[0];
      URL_RE.lastIndex = 0;
      onTunnelUrl(url).catch((err) => {
        console.error(`❌ Post-tunnel step failed: ${err.message}`);
      });
    }
  };
  cloudflared.stdout.on('data', onData);
  cloudflared.stderr.on('data', onData);

  cloudflared.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`cloudflared exited with code ${code}`);
      process.exit(code ?? 1);
    }
  });
  cloudflared.on('error', (err) => {
    console.error(`Failed to start cloudflared: ${err.message}`);
    console.error('Install it with: pnpm add -Dw cloudflared  (or: choco install cloudflared)');
    process.exit(1);
  });
}

async function onTunnelUrl(url) {
  console.log(`\n✅ Tunnel ready: ${url}`);

  // Verify the tunnel actually serves traffic before announcing it
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    console.log(`   Verified reachable (HTTP ${res.status})`);
  } catch (err) {
    console.warn(`   Warning: could not verify tunnel yet (${err.message}) — sending anyway`);
  }

  if (NO_MAIL) return;

  const { sendEmail } = await import('./emailService.js');
  const when = new Date().toLocaleString();
  await sendEmail({ url, when });
  console.log(`📧 Tunnel URL emailed.`);

  startHealthMonitor();
}

function startHealthMonitor() {
  if (!HEALTH_ENABLED) return;
  healthTimer = setInterval(async () => {
    try {
      // Any HTTP response (even 404) proves the server is alive;
      // only a network error counts as down.
      await fetch(`${LOCAL_URL}${HEALTH_PATH}`, {
        signal: AbortSignal.timeout(5000),
      });
      consecutiveFailures = 0;
    } catch {
      consecutiveFailures++;
      console.log(`⚠️  Local server unreachable (${consecutiveFailures}/${HEALTH_MAX_FAILURES})`);
      if (consecutiveFailures >= HEALTH_MAX_FAILURES) {
        killTunnel(`Local server on ${LOCAL_URL} is down — tunnel stopped.`);
      }
    }
  }, HEALTH_INTERVAL);
  healthTimer.unref();
}

console.log(`🚇 Starting Cloudflare Tunnel → ${LOCAL_URL}`);
if (NO_MAIL) console.log('   (--no-mail: URL will only print here)');
startCloudflared();
