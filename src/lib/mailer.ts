/**
 * Email via Resend. With no RESEND_API_KEY (local dev) the message is printed to the terminal instead.
 * Free plan: 100/day, 3,000/month — so only ever mail the one person who has to act.
 */
import { env } from 'cloudflare:workers';
import { audit } from './db';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** The designed version. Mail programs that can't show it (or people who turned it off) get `text`. */
  html?: string;
}

export async function sendMail(m: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`\n──── EMAIL (dev, not sent) ────\nTo: ${m.to}\nSubject: ${m.subject}\n\n${m.text}\n───────────────────────────────\n`);
    return true;
  }
  let status = 0;
  let reply = '';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM ?? 'МОХ <no-reply@team.pkumongolia.com>', to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }),
    });
    if (res.ok) return true;
    status = res.status;
    reply = await res.text();
  } catch (e) {
    reply = String(e);
  }
  // A failed send is written to the activity log (Бүртгэл) with Resend's reply, so the reason can be read
  // without a live log stream. The address and reply only, never the message: it holds the login code.
  console.error('Resend error', status, reply);
  try {
    await audit(null, 'mail_failed', 'mail', null, { to: m.to, status, reply: reply.slice(0, 500) });
  } catch {
    /* the log is best-effort here */
  }
  return false;
}

// ── the designed layout ──────────────────────────────────────────────────────────────────────────────
// Mail programs (QQ, 163, the school's Coremail, Gmail, Outlook) understand only old HTML: tables, inline
// styles, no web fonts, no SVG. So: one 560 px table, colors written out, the logo as a PNG from the site.

const SITE = 'https://pkumongolia.com';
const C = {
  navy: '#0d2138', blue: '#005faf', gold: '#ffd300', paper: '#f4f1ea', card: '#ffffff', sunk: '#f3efe8',
  ink: '#1c1917', ink2: '#4a4540', ink3: '#6b645c', line: '#e6dfd4',
};
const FONT = "'Golos Text','Segoe UI',Roboto,'Helvetica Neue',Arial,'Microsoft YaHei',sans-serif";

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Layout {
  /** Shown in the inbox list next to the subject, hidden in the message itself. */
  preview: string;
  heading: string;
  /** Paragraphs, plain text (escaped here). */
  lines: string[];
  code?: string;
  button?: { label: string; url: string };
  /** Small grey print under the main part. */
  note?: string[];
}

function layout(l: Layout): string {
  const p = (t: string, extra = '') =>
    `<p style="margin:0 0 14px;font:15px/1.6 ${FONT};color:${C.ink2};${extra}">${esc(t)}</p>`;
  const code = l.code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 20px"><tr>
        <td align="center" style="background:${C.sunk};border:1px solid ${C.line};border-radius:10px;padding:18px 12px">
          <div style="font:600 12px/1 ${FONT};letter-spacing:1.5px;text-transform:uppercase;color:${C.ink3};margin-bottom:10px">Таны код</div>
          <div style="font:700 34px/1.1 Consolas,'SF Mono',Menlo,'Courier New',monospace;letter-spacing:10px;color:${C.navy};padding-left:10px">${esc(l.code)}</div>
        </td></tr></table>`
    : '';
  const button = l.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px"><tr>
        <td style="background:${C.blue};border-radius:8px">
          <a href="${esc(l.button.url)}" style="display:inline-block;padding:13px 26px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none">${esc(l.button.label)} &rarr;</a>
        </td></tr></table>
      <p style="margin:0 0 14px;font:12px/1.5 ${FONT};color:${C.ink3};word-break:break-all">Товч ажиллахгүй бол энэ хаягийг хуулж нээнэ үү:<br><a href="${esc(l.button.url)}" style="color:${C.blue}">${esc(l.button.url)}</a></p>`
    : '';
  const note = l.note?.length
    ? `<tr><td style="padding:16px 32px 22px;border-top:1px solid ${C.line}">${l.note
        .map((t) => `<p style="margin:0 0 6px;font:13px/1.55 ${FONT};color:${C.ink3}">${esc(t)}</p>`)
        .join('')}</td></tr>`
    : '';
  return `<!doctype html>
<html lang="mn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(l.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(l.preview)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.paper}"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px">
    <tr><td style="background:${C.navy};border-radius:12px 12px 0 0;padding:18px 28px;border-bottom:3px solid ${C.gold}">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="background:#ffffff;border-radius:8px;padding:5px 7px;line-height:0"><img src="${SITE}/brand/logo-512.png" width="44" height="33" alt="МОХ" style="display:block;border:0"></td>
        <td style="padding-left:14px;font:600 14px/1.3 ${FONT};color:#ffffff">Бээжингийн Их Сургуулийн<br><span style="font-weight:400;color:#c9d3df">Монгол Оюутны Холбоо</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.card};padding:30px 32px 12px">
      <h1 style="margin:0 0 16px;font:700 22px/1.3 ${FONT};color:${C.ink}">${esc(l.heading)}</h1>
      ${l.lines.map((t) => p(t)).join('')}
      ${code}${button}
    </td></tr>
    ${note ? note.replace('<tr><td style="', `<tr><td style="background:${C.card};`) : ''}
    <tr><td style="background:${C.card};border-radius:0 0 12px 12px;height:8px;line-height:8px;font-size:0">&nbsp;</td></tr>
    <tr><td align="center" style="padding:18px 12px 0;font:12px/1.6 ${FONT};color:${C.ink3}">
      МОХ-ны ажлын орчноос автоматаар илгээсэн захидал. Хариу бичих шаардлагагүй.<br>
      <a href="${SITE}" style="color:${C.ink3}">pkumongolia.com</a> · <span lang="zh-Hans">北京大学蒙古国留学生学生会</span>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const SIGN = '— Бээжингийн Их Сургуулийн Монгол Оюутны Холбоо';

export function loginCodeMail(to: string, code: string): Mail {
  return {
    to,
    subject: `Нэвтрэх код: ${code}`,
    text: [
      'Сайн байна уу,',
      '',
      `МОХ-ны ажлын орчинд нэвтрэх код тань: ${code}`,
      '',
      'Код 10 минут хүчинтэй бөгөөд ганц удаа ашиглана.',
      'Та код хүсээгүй бол энэ захидлыг анхааралгүй орхиж болно.',
      '',
      SIGN,
    ].join('\n'),
    html: layout({
      preview: `Код ${code} · 10 минут хүчинтэй`,
      heading: 'Нэвтрэх код',
      lines: ['Сайн байна уу,', 'МОХ-ны ажлын орчинд нэвтрэхийн тулд доорх кодыг оруулна уу.'],
      code,
      note: ['Код 10 минут хүчинтэй бөгөөд ганц удаа ашиглана.', 'Та код хүсээгүй бол энэ захидлыг анхааралгүй орхиж болно. Бүртгэл тань аюулгүй.'],
    }),
  };
}

export function inviteCodeMail(to: string, code: string, name: string): Mail {
  return {
    to,
    subject: `Бүртгэлээ баталгаажуулах код: ${code}`,
    text: [
      `Сайн байна уу, ${name},`,
      '',
      `МОХ-ны ажлын орчинд бүртгүүлэхийн тулд энэ кодыг оруулна уу: ${code}`,
      '',
      'Код 10 минут хүчинтэй.',
      '',
      SIGN,
    ].join('\n'),
    html: layout({
      preview: `Код ${code} · бүртгэлээ дуусгана уу`,
      heading: 'Ажлын орчинд тавтай морил',
      lines: [`Сайн байна уу, ${name},`, 'Бүртгэлээ дуусгахын тулд урилгын хуудсан дээр доорх кодыг оруулна уу.'],
      code,
      note: ['Код 10 минут хүчинтэй.', 'Та урилга хүлээж аваагүй бол энэ захидлыг анхааралгүй орхиж болно.'],
    }),
  };
}

export function awaitingDecisionMail(to: string, title: string, number: string | null, url: string): Mail {
  const doc = `«${title}»${number ? ` (${number})` : ''}`;
  return {
    to,
    subject: `Таны шийдвэр хүлээж байна: ${title}`,
    text: ['Сайн байна уу,', '', `${doc} баримт бичиг таны хяналтад ирлээ.`, '', url, '', '— МОХ-ны ажлын орчин'].join('\n'),
    html: layout({
      preview: `${doc} таны шийдвэрийг хүлээж байна`,
      heading: 'Таны шийдвэр хүлээж байна',
      lines: ['Сайн байна уу,', `${doc} баримт бичиг таны хяналтад ирлээ.`],
      button: { label: 'Баримтыг нээх', url },
    }),
  };
}

export function jobAssignedMail(to: string, by: string, title: string, url: string): Mail {
  return {
    to,
    subject: `Танд ажил оноолоо: ${title}`,
    text: ['Сайн байна уу,', '', `${by} таныг «${title}» ажлын хариуцагчаар томиллоо.`, '', url, '', '— МОХ-ны ажлын орчин'].join('\n'),
    html: layout({
      preview: `${by} танд «${title}» ажлыг хариуцуулав`,
      heading: 'Танд шинэ ажил оноолоо',
      lines: ['Сайн байна уу,', `${by} таныг «${title}» ажлын хариуцагчаар томиллоо.`],
      button: { label: 'Ажлыг нээх', url },
    }),
  };
}
