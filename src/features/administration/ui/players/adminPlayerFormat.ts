import { fr, locale } from '@/i18n/fr';

export function formatAdminPlayerSignedAmount(value: string | null): string {
  return value === null
    ? fr.admin.unavailable
    : new Intl.NumberFormat(locale).format(BigInt(value));
}
