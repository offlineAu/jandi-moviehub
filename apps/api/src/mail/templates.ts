/**
 * Transactional email templates. Every template returns a subject, a plain-text body and an
 * HTML body built from one shared layout, so all mail looks alike and always has a text
 * alternative (spam filters and text-only clients need it). Values are escaped before they
 * reach HTML; links are only ever ones the API built itself.
 */

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

interface LayoutInput {
  /** Hidden inbox preview line. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  action: { label: string; url: string };
  /** Small print under the button (expiry, "ignore this if…"). */
  footnote: string;
}

const BRAND = 'Jandi MovieHub';
const COLORS = {
  page: '#0b0a10',
  card: '#16141f',
  text: '#ece9f5',
  muted: '#a19bb5',
  accent: '#9333ea',
  border: '#2a2638',
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderLayout(input: LayoutInput): { text: string; html: string } {
  const text = [
    input.heading,
    '',
    ...input.paragraphs.flatMap((p) => [p, '']),
    `${input.action.label}: ${input.action.url}`,
    '',
    input.footnote,
    '',
    `— ${BRAND}`,
  ].join('\n');

  const url = escapeHtml(input.action.url);
  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.text};">${escapeHtml(p)}</p>`,
    )
    .join('');

  // Table layout + inline styles: the only thing every mail client renders consistently.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="padding:0 4px 20px;font-size:18px;font-weight:700;color:${COLORS.text};">${BRAND}</td></tr>
<tr><td style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;padding:32px 28px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${COLORS.text};">${escapeHtml(input.heading)}</h1>
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
<td style="border-radius:10px;background:${COLORS.accent};">
<a href="${url}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(input.action.label)}</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(input.footnote)}</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:${COLORS.muted};word-break:break-all;">Button not working? Paste this link into your browser:<br><a href="${url}" style="color:${COLORS.muted};">${url}</a></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;color:${COLORS.muted};">Your Movie Night. Everyone's Invited.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { text, html };
}

export const mailTemplates = {
  verifyEmail(input: { displayName: string; link: string; expiresInHours: number }): RenderedMail {
    return {
      subject: `Verify your ${BRAND} email`,
      ...renderLayout({
        preheader: 'Confirm your email to secure your account.',
        heading: `Welcome, ${input.displayName}`,
        paragraphs: [
          `Thanks for joining ${BRAND}. Confirm this is your email address so you can recover your account and get watch party invites.`,
        ],
        action: { label: 'Verify email', url: input.link },
        footnote: `This link expires in ${input.expiresInHours} hours. If you didn't create an account, you can ignore this email.`,
      }),
    };
  },

  passwordReset(input: { link: string; expiresInMinutes: number }): RenderedMail {
    return {
      subject: `Reset your ${BRAND} password`,
      ...renderLayout({
        preheader: 'Use this link to choose a new password.',
        heading: 'Reset your password',
        paragraphs: [
          'Someone (hopefully you) asked to reset the password for your account. Choose a new one with the button below; signing in again will be required on all your devices.',
        ],
        action: { label: 'Choose a new password', url: input.link },
        footnote: `This link expires in ${input.expiresInMinutes} minutes. If you didn't request this, ignore this email — your password stays the same.`,
      }),
    };
  },
};

export type MailTemplateName = keyof typeof mailTemplates;
