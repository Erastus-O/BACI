const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gbpWhole = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export function money(n: number, whole = false) {
  const s = (whole ? gbpWhole : gbp).format(Math.abs(n));
  return n < 0 ? `−${s}` : s;
}

/** First money amount in free text: "a £1,200 laptop" → 1200, "1400 pounds" → 1400. */
export function parseAmount(text: string): number | null {
  const m = text.match(/£\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?|(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(?:pounds|quid|gbp)\b/i);
  if (!m) return null;
  const whole = (m[1] ?? m[3]).replace(/,/g, '');
  const pence = m[2] ?? m[4];
  const n = Number(pence ? `${whole}.${pence}` : whole);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A reply that is just a number, e.g. "1400" or "£1,400". */
export function parseBareAmount(text: string): number | null {
  const m = text.trim().match(/^£?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:pounds|quid)?[.!]?$/i);
  if (!m) return parseAmount(text);
  const n = Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`);
  return n > 0 ? n : null;
}

/** Best-effort item: "Can I afford a £1,200 laptop?" → "laptop"; "buy this sofa on finance" → "sofa". */
export function parseItem(text: string): string | null {
  const afterPrice = text.match(/£\s?[\d,.]+\s+([a-z][a-z-]*(?:\s[a-z][a-z-]*)?)/i);
  const stop = /^(on|in|for|now|this|next|today|tomorrow|with|using|over|at|and|or|please)$/i;
  if (afterPrice) {
    const words = afterPrice[1].split(' ').filter((w) => !stop.test(w));
    if (words.length) return words.join(' ').toLowerCase();
  }
  const det = text.match(/\b(?:a|an|this|the|that|new)\s+(?:new\s+)?([a-z][a-z-]{2,})/i);
  if (det && !stop.test(det[1])) return det[1].toLowerCase();
  return null;
}

/** "24 months at 9.9%", "2 years", "not sure of the APR". */
export function parseTerm(text: string): { months: number | null; apr: number | null; aprUnknown: boolean } {
  const mo = text.match(/(\d{1,3})\s*(?:months?|mths?|mo)\b/i);
  const yr = text.match(/(\d{1,2})\s*(?:years?|yrs?)\b/i);
  const apr = text.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
  return {
    months: mo ? Number(mo[1]) : yr ? Number(yr[1]) * 12 : null,
    apr: apr ? Number(apr[1]) : null,
    aprUnknown: /not sure|don'?t know|no idea|unsure|not certain/i.test(text),
  };
}
