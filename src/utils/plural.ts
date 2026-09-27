/**
 * Russian plural form for a count: forms are [1, 2–4, 5+], e.g.
 * ["идея", "идеи", "идей"]. 11–14 always take the "5+" form.
 */
export function pluralRu(count: number, forms: [string, string, string]): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}
