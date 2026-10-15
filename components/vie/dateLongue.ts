// components/vie/dateLongue.ts
import { formatIsoDay } from '../../utils/format';

/** « 14 juin 2027 », « 1er mai 2028 » : jour ISO en toutes lettres, premier du mois en ordinal (typographie française). */
export const dateLongue = (iso: string): string => formatIsoDay(iso).replace(/^1 /, '1er ');
