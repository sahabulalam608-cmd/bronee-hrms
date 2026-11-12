/**
 * Transactional email delivery.
 *  - `console` provider: logs the payload (development / no-quota fallback).
 *  - `resend` provider: uses the Resend free tier via a plain HTTPS call.
 *
 * Every attempt is recorded in `email_log` so delivery status can be audited.
 */
import type { DB } from '../db/client.js';
import { emailLog } from '../db/schema.js';
import type { Env } from '../env.js';
import { randomId } from './crypto.js';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailResult = { status: 'sent' | 'failed' | 'skipped'; error?: string };

const BRAND = {
  accent: '#7A63E8',
  ink: '#0F172A',
  muted: '#64748B',
  line: '#E8EAF2',
};

export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F7F7FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;border:1px solid ${BRAND.line};overflow:hidden;">
        <tr><td style="padding:22px 28px;border-bottom:1px solid ${BRAND.line};">
          <div style="font-size:15px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.2px;">BRONEE <span style="color:${BRAND.accent};">HRMS</span></div>
          <div style="font-size:12px;color:${BRAND.muted};margin-top:2px;">BRONEE Limited · Human Resource Management</div>
        </td></tr>
        <tr><td style="padding:28px;color:${BRAND.ink};font-size:14px;line-height:1.65;">
          <h1 style="margin:0 0 14px;font-size:19px;line-height:1.35;font-weight:700;">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${BRAND.line};font-size:11px;color:${BRAND.muted};">
          This is an automated message from BRONEE HRMS. Please do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`;
}

export function actionButton(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin:6px 0 14px;padding:11px 18px;background:${BRAND.accent};color:#ffffff;border-radius:10px;text-decoration:none;font-weight:600;font-size:13px;">${escapeHtml(label)}</a>`;
}

export function detailList(items: Array<[string, string]>): string {
  const rows = items
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:${BRAND.muted};font-size:13px;width:38%;">${escapeHtml(k)}</td><td style="padding:6px 0;color:${BRAND.ink};font-size:13px;font-weight:600;">${escapeHtml(v)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;">${rows}</table>`;
}

export async function sendEmail(db: DB, env: Env, message: EmailMessage): Promise<EmailResult> {
  const provider = (env.EMAIL_PROVIDER || 'console').toLowerCase();

  if (provider === 'console') {
    console.log(`[email:console] to=${message.to} subject=${message.subject}`);
    await db.insert(emailLog).values({
      id: randomId(),
      toEmail: message.to,
      subject: message.subject,
      provider: 'console',
      status: 'skipped',
      error: null,
    });
    return { status: 'skipped' };
  }

  if (provider === 'resend') {
    if (!env.RESEND_API_KEY) {
      await db.insert(emailLog).values({
        id: randomId(),
        toEmail: message.to,
        subject: message.subject,
        provider: 'resend',
        status: 'failed',
        error: 'RESEND_API_KEY is not configured',
      });
      return { status: 'failed', error: 'RESEND_API_KEY is not configured' };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM || 'BRONEE HRMS <no-reply@bronee.com>',
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: env.EMAIL_REPLY_TO || undefined,
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        await db.insert(emailLog).values({
          id: randomId(),
          toEmail: message.to,
          subject: message.subject,
          provider: 'resend',
          status: 'failed',
          error: detail.slice(0, 500),
        });
        return { status: 'failed', error: detail.slice(0, 300) };
      }
      await db.insert(emailLog).values({
        id: randomId(),
        toEmail: message.to,
        subject: message.subject,
        provider: 'resend',
        status: 'sent',
        error: null,
      });
      return { status: 'sent' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await db.insert(emailLog).values({
        id: randomId(),
        toEmail: message.to,
        subject: message.subject,
        provider: 'resend',
        status: 'failed',
        error: detail.slice(0, 500),
      });
      return { status: 'failed', error: detail.slice(0, 300) };
    }
  }

  await db.insert(emailLog).values({
    id: randomId(),
    toEmail: message.to,
    subject: message.subject,
    provider,
    status: 'skipped',
    error: `Unknown provider "${provider}"`,
  });
  return { status: 'skipped' };
}
