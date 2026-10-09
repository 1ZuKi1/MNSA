/**
 * Documents from before the website. The association wrote its papers in Word and signed them by hand; they
 * are entered into the archive (migration 0012) so every year sits in «Баримт бичиг». Such a record is stored
 * as approved and never edited: what the paper says about itself — heading, date, signers — lives in
 * records.paper_json, its text in fields_json.text.
 */
/** What a paper document says about itself: approved on paper before the website, not through the site. */
export interface PaperInfo {
  /** The original file, e.g. «J-0001.docx». */
  source: string;
  /** The large heading on the paper (ЖУРАМ, МЭДЭГДЭЛ …); empty when the paper has none. */
  kind: string;
  /** The subject line under it, as written on the paper. */
  subject: string | null;
  /** The date on the paper (YYYY-MM-DD); null when the paper carries none. */
  date: string | null;
  /** Who signed, as on the paper: titles left to right, names under them (empty = left blank on the paper). */
  signers: { title: string; names: string[] }[];
  /** The number exactly as written, when it was filed under another (paper «0003», filed as Ж-0003). */
  paper_number?: string;
  /** Anything the archive should say about the paper (missing signatures, an earlier version …). */
  note?: string;
  imported_at?: number;
}

export function paperOf(r: { paper_json: string | null }): PaperInfo | null {
  if (!r.paper_json) return null;
  try {
    const p = JSON.parse(r.paper_json);
    return p && typeof p === 'object' ? { kind: '', subject: null, date: null, signers: [], ...p } : null;
  } catch {
    return null;
  }
}
