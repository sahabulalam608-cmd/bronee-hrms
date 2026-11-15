/**
 * BRONEE HRMS — outbound email.
 *
 * Uses the Cloudflare Email Workers binding when one is configured, and
 * falls back to a no-op log so local development never sends real mail.
 * Email templates carry no salary amounts — only HR may see those.
 */

import type { Env } from '../env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(env: Env, mail: Mail): Promise<'Sent' | 'Not Sent' | 'Failed'> {
  if (!env.EMAIL) {
    console.log('[mail:simulated]', mail.subject, '→', mail.to);
    return 'Sent';
  }
  try {
    await env.EMAIL.send({
      from: 'BRONEE HRMS <hr@bronneltd.com>',
      to: [mail.to],
      subject: mail.subject,
      html: mail.html ?? `<p style="font-family:system-ui,sans-serif">${mail.text.replace(/\n/g, '<br>')}</p>`,
    });
    return 'Sent';
  } catch (error) {
    console.error('[mail:failed]', error);
    return 'Failed';
  }
}

export function leaveTemplate(employeeName: string, status: string, from: string, to: string, reason?: string) {
  const subject =
    status === 'Approved' ? 'Your leave application has been approved' : 'Your leave application was declined';
  const body =
    status === 'Approved'
      ? `Dear ${employeeName},\n\nYour leave request from ${from} to ${to} has been approved by HR.\n\nBRONEE HRMS`
      : `Dear ${employeeName},\n\nYour leave request from ${from} to ${to} was declined by HR.${
          reason ? `\n\nReason: ${reason}` : ''
        }\n\nBRONEE HRMS`;
  return { subject, body };
}
