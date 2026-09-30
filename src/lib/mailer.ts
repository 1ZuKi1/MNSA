/**
 * Email via Resend. With no RESEND_API_KEY (local dev) the message is printed to the terminal instead.
 * Free plan: 100/day, 3,000/month — so only ever mail the one person who has to act.
 */
import { env } from 'cloudflare:workers';
import { audit } from './db';

interface Mail {
  to: string;
  subject: string;
  text: string;
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
      body: JSON.stringify({ from: env.MAIL_FROM ?? 'МОХ <no-reply@team.pkumongolia.com>', to: [m.to], subject: m.subject, text: m.text }),
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

export function loginCodeMail(to: string, code: string): Mail {
  return {
    to,
    subject: `Нэвтрэх код: ${code}`,
    text: [
      'Сайн байна уу,',
      '',
      `МОХ-ны ажлын орчинд нэвтрэх таны код: ${code}`,
      '',
      'Код 10 минутын турш хүчинтэй бөгөөд зөвхөн нэг удаа ашиглагдана.',
      'Хэрэв та нэвтрэх хүсэлт илгээгээгүй бол энэ захидлыг үл тоомсорлоно уу.',
      '',
      '— Бээжингийн Их Сургуулийн Монгол Оюутны Холбоо',
    ].join('\n'),
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
      'Код 10 минутын турш хүчинтэй.',
      '',
      '— Бээжингийн Их Сургуулийн Монгол Оюутны Холбоо',
    ].join('\n'),
  };
}

export function awaitingDecisionMail(to: string, title: string, number: string | null, url: string): Mail {
  return {
    to,
    subject: `Таны шийдвэр хүлээж байна: ${title}`,
    text: [
      'Сайн байна уу,',
      '',
      `«${title}»${number ? ` (${number})` : ''} баримт бичиг таны хяналтад ирлээ.`,
      '',
      url,
      '',
      '— МОХ-ны ажлын орчин',
    ].join('\n'),
  };
}
