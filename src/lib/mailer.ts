/**
 * Email via Resend. With no RESEND_API_KEY (local dev) the message is printed to the terminal instead.
 * Free plan: 100/day, 3,000/month — so only ever mail the one person who has to act.
 */
import { env } from 'cloudflare:workers';

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
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM ?? 'МОХ <no-reply@bdmnsa.com>', to: [m.to], subject: m.subject, text: m.text }),
  });
  if (!res.ok) console.error('Resend error', res.status, await res.text());
  return res.ok;
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
