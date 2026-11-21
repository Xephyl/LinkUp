// scripts/emailTemplate.js
// HTML email template for tunnel URL notifications. Inline styles only —
// email clients strip <style> blocks and external CSS.

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * @param {object} opts
 * @param {string} opts.url      Public tunnel URL
 * @param {string} [opts.adminUrl] Optional admin URL
 * @param {string} [opts.when]   Human-readable timestamp
 * @returns {string} HTML body
 */
function buildEmailHtml({ url, adminUrl, when }) {
  const safeUrl = escapeHtml(url);
  const rows = [
    `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Public URL</td>
     <td style="padding:8px 0;"><a href="${safeUrl}" style="color:#2563eb;font-size:15px;">${safeUrl}</a></td></tr>`,
  ];
  if (adminUrl) {
    const safeAdmin = escapeHtml(adminUrl);
    rows.push(
      `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Admin</td>
       <td style="padding:8px 0;"><a href="${safeAdmin}" style="color:#2563eb;font-size:15px;">${safeAdmin}</a></td></tr>`
    );
  }
  if (when) {
    rows.push(
      `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Started</td>
       <td style="padding:8px 0;color:#374151;font-size:14px;">${escapeHtml(when)}</td></tr>`
    );
  }

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <h1 style="margin:0 0 4px;font-size:20px;color:#111827;">Dev tunnel is live</h1>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Temporary Cloudflare Tunnel URL — valid only while the tunnel runs.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${rows.join('\n      ')}
    </table>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">
      Anyone with this URL can reach your local dev server. Stop the tunnel when done.
    </p>
  </div>
</body></html>`;
}

module.exports = { buildEmailHtml };
