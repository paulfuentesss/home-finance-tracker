// Which Billers tab values get a Copy button (docs/features/billers.md): the ones people paste
// somewhere — account and ID numbers, emails, IP addresses. One "word" with a digit or an @;
// names, notes and sentences ("Call 171", "Via the app…") don't. Passwords always can, once revealed.

export function isCopyable(value: string): boolean {
  const v = value.trim();
  return v !== "" && !/\s/.test(v) && /[\d@]/.test(v);
}
