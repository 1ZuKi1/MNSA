/**
 * Makes the phone numbers, e-mail addresses and website names that already sit inside a sentence tappable.
 * The text is escaped first and only these three patterns become links, so it is safe to print as HTML.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function linkify(text: string): string {
  return esc(text)
    .replace(/\+86 10 (\d{4}) (\d{4})/g, (m, a, b) => `<a href="tel:+8610${a}${b}">${m}</a>`)
    .replace(/[\w.-]+@[\w.-]+\.[a-z]{2,}/gi, (m) => `<a href="mailto:${m}">${m}</a>`)
    .replace(
      /\b(consular\.mfa\.gov\.cn\/VISA|zwfw\.gaj\.beijing\.gov\.cn\/rp|studyatpku\.com|elective\.pku\.edu\.cn|lxbx\.net)/g,
      (m) => `<a href="https://${m}" rel="noopener">${m}</a>`,
    );
}
