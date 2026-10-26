const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(num: number | string): string {
  const str = String(num);
  return str.replace(/\d/g, (d) => BANGLA_DIGITS[parseInt(d, 10)] ?? d);
}

export function formatTaka(amount: number): string {
  return `৳ ${toBanglaDigits(amount)}`;
}
