// components/future/ProjectionExplains.tsx
// G22-F1 — Page « Explications » : explorateur data-driven de la projection.
//
// Pour CHAQUE année (drill-down mois par mois) : ce qui arrive à CHAQUE compte
// et POURQUOI. Réutilise les journaux du moteur (flowEvents/lifeEvents, déjà en
// français clair depuis UX1) + un détail chiffré par compte (cotisations,
// croissance marché, retraits, transferts). Barre de recherche transverse +
// section méthodologie pour les concepts (RAP, CELIAPP, ordre de retrait…).
//
// 100 % pilotée par les vraies données de projection — aucun chiffre inventé.

import React, { useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import type { ProjectionChartPoint } from '../../services/projection/types';

interface ProjectionExplainsProps {
  chartData: ProjectionChartPoint[];
}

const fmt = (n: number): string => `${n < 0 ? '-' : ''}${Math.abs(Math.round(n)).toLocaleString('fr-CA')} $`;
const fmtSigned = (n: number): string => `${n >= 0 ? '+' : '-'}${Math.abs(Math.round(n)).toLocaleString('fr-CA')} $`;

/** Définition d'un compte : libellé + champs du point de projection à lire. */
interface AccountDef {
  key: string;
  label: string;
  balance: keyof ProjectionChartPoint;
  contrib?: keyof ProjectionChartPoint;
  growth?: keyof ProjectionChartPoint;
  withdrawal?: keyof ProjectionChartPoint;
  transfer?: keyof ProjectionChartPoint;
  payout?: keyof ProjectionChartPoint;
}

const ACCOUNTS: ReadonlyArray<AccountDef> = [
  { key: 'liquid', label: 'Liquidités', balance: 'Liquidites', growth: 'MarketGrowthLiquid', transfer: 'NetTransferLiquid' },
  { key: 'celi', label: 'CELI', balance: 'CELI', contrib: 'ContribCELI', growth: 'MarketGrowthCELI', withdrawal: 'RetraitCELI', transfer: 'NetTransferCELI' },
  { key: 'reer', label: 'REER', balance: 'REER', contrib: 'ContribREER', growth: 'MarketGrowthREER', withdrawal: 'RetraitREER', transfer: 'NetTransferREER' },
  { key: 'celiapp', label: 'CELIAPP (FHSA)', balance: 'CELIAPP', growth: 'MarketGrowthCELIAPP', transfer: 'NetTransferCELIAPP' },
  { key: 'nonreg', label: 'Compte non-enregistré', balance: 'NonReg', contrib: 'ContribNonReg', growth: 'MarketGrowthNonReg', transfer: 'NetTransferNonReg' },
  { key: 'crypto', label: 'Crypto', balance: 'Crypto', growth: 'MarketGrowthCrypto', transfer: 'NetTransferCrypto' },
  { key: 'reee', label: 'REEE (études)', balance: 'REEE', contrib: 'ReeeContrib', growth: 'MarketGrowthREEE', payout: 'ReeePayout' },
  { key: 'immo', label: 'Immobilier', balance: 'Immobilier' },
  { key: 'dette', label: 'Dettes', balance: 'DetteTotale' },
];

const METHODOLOGY: ReadonlyArray<{ q: string; a: string }> = [
  { q: "Comment l'app projette mon avenir ?", a: "Chaque mois, à partir de janvier 2026, le moteur applique tes revenus, tes dépenses, la croissance des marchés, l'inflation, les impôts et tes événements (achat, enfant, retraite). Le résultat est ta valeur nette mois après mois." },
  { q: "Dans quel ordre l'app pige dans mes comptes ?", a: "À la retraite (ou en manque de liquidités), l'app retire d'abord là où c'est le plus avantageux fiscalement : REER au taux 0 %, puis selon ta stratégie (CELI d'abord, REER d'abord, ou automatique selon ton taux marginal). Le but : payer le moins d'impôt possible." },
  { q: "C'est quoi le RAP ?", a: "Le Régime d'accession à la propriété te laisse retirer de ton REER sans impôt pour acheter une 1re maison (tu le rembourses ensuite sur 15 ans). L'app l'utilise automatiquement à l'achat si c'est avantageux." },
  { q: "C'est quoi le CELIAPP (FHSA) ?", a: "Le Compte d'épargne libre d'impôt pour l'achat d'une 1re propriété : cotisations déductibles ET retrait non imposable pour l'achat. L'app le priorise pour un premier achat." },
  { q: "Pourquoi mes impôts changent chaque année ?", a: "Ton taux dépend de tes revenus (salaire, retraits REER, gains, dividendes, pensions). L'app calcule le fédéral + le Québec avec les barèmes 2026 et les indexe pour les années futures." },
  { q: "C'est quoi le « cône » Monte Carlo ?", a: "Au lieu d'un rendement fixe, l'app simule des centaines de scénarios de marché (bons et mauvais). La zone ombrée montre la fourchette probable (P10 à P90) de ta valeur nette." },
];

interface MonthRow {
  account: string;
  balance: number;
  parts: string[];
}

/** Extrait les comptes ayant bougé ce mois-ci (cotisation/croissance/retrait/transfert). */
function buildMonthRows(p: ProjectionChartPoint): MonthRow[] {
  const num = (k?: keyof ProjectionChartPoint): number => {
    if (!k) return 0;
    const v = p[k];
    return typeof v === 'number' ? v : 0;
  };
  const rows: MonthRow[] = [];
  for (const acc of ACCOUNTS) {
    const balance = num(acc.balance);
    const contrib = num(acc.contrib);
    const growth = num(acc.growth);
    const withdrawal = num(acc.withdrawal);
    const transfer = num(acc.transfer);
    const payout = num(acc.payout);
    const parts: string[] = [];
    if (contrib > 0.5) parts.push(`${fmtSigned(contrib)} cotisé`);
    if (Math.abs(growth) > 0.5) parts.push(`${fmtSigned(growth)} marché`);
    if (withdrawal > 0.5) parts.push(`${fmtSigned(-withdrawal)} retrait`);
    if (payout > 0.5) parts.push(`${fmtSigned(-payout)} versé`);
    if (Math.abs(transfer) > 0.5) parts.push(`${fmtSigned(transfer)} transfert`);
    // On affiche un compte s'il a un solde non négligeable OU un mouvement ce mois.
    if (Math.abs(balance) > 0.5 || parts.length > 0) {
      rows.push({ account: acc.label, balance, parts });
    }
  }
  return rows;
}

/** Texte cherchable d'un mois (date + événements + comptes mouvementés). */
function monthSearchBlob(p: ProjectionChartPoint, rows: MonthRow[]): string {
  const events = [...(p.flowEvents ?? []), ...(p.lifeEvents ?? [])].join(' ');
  const movedAccounts = rows.filter(r => r.parts.length > 0).map(r => r.account).join(' ');
  return `${p.dateLabel ?? ''} ${p.year ?? ''} ${events} ${movedAccounts}`.toLowerCase();
}

interface YearGroup {
  year: number;
  age?: number;
  endNetWorth: number;
  startNetWorth: number;
  months: ProjectionChartPoint[];
}

export const ProjectionExplains: React.FC<ProjectionExplainsProps> = ({ chartData }) => {
  const [query, setQuery] = useState('');
  const [openYears, setOpenYears] = useState<Set<number>>(new Set());
  const [showMethodo, setShowMethodo] = useState(false);

  // Garde uniquement les points mensuels « complets » (déterministes, avec une année).
  const months = useMemo(
    () => chartData.filter(p => typeof p.year === 'number' && !!p.dateLabel),
    [chartData],
  );

  const groups = useMemo<YearGroup[]>(() => {
    const byYear = new Map<number, ProjectionChartPoint[]>();
    for (const p of months) {
      const y = p.year as number;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(p);
    }
    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, pts]) => ({
        year,
        age: pts[pts.length - 1].age,
        startNetWorth: pts[0].NetWorth,
        endNetWorth: pts[pts.length - 1].NetWorth,
        months: pts,
      }));
  }, [months]);

  const q = query.trim().toLowerCase();

  // Recherche : months matching + pré-calcul des rows par mois (mémoïsé).
  const matchInfo = useMemo(() => {
    const rowsByMonth = new Map<number, MonthRow[]>();
    const matchedMonths = new Set<number>();
    const matchedYears = new Set<number>();
    for (const p of months) {
      const rows = buildMonthRows(p);
      rowsByMonth.set(p.monthIndex, rows);
      if (q && monthSearchBlob(p, rows).includes(q)) {
        matchedMonths.add(p.monthIndex);
        if (typeof p.year === 'number') matchedYears.add(p.year);
      }
    }
    return { rowsByMonth, matchedMonths, matchedYears };
  }, [months, q]);

  const toggleYear = (year: number) => {
    setOpenYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  if (months.length === 0) {
    return (
      <Card title="📖 Explications">
        <p className="text-body text-ink-300">
          Lance d'abord une simulation (onglet Paramètres) — les explications détaillées,
          année par année et compte par compte, apparaîtront ici.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="📖 Explications — ton avenir, ligne par ligne">
        <p className="text-meta text-ink-400 mb-3 leading-relaxed">
          Voici tout ce que l'app calcule pour toi : pour chaque année (clique pour ouvrir le
          détail mois par mois), ce qui arrive à chaque compte et pourquoi. Cherche un mot
          (ex. « maison », « RAP », « REER », « retraite ») pour aller droit au but.
        </p>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher dans tes prévisions…"
          aria-label="Rechercher dans les explications"
          className="w-full bg-dark border border-border rounded-card px-3 py-2 text-ink-50 text-body focus:border-primary outline-none"
        />
        {q && (
          <p className="text-tiny text-ink-400 mt-2" aria-live="polite">
            {matchInfo.matchedMonths.size} mois trouvé(s) sur {matchInfo.matchedYears.size} année(s).
          </p>
        )}
      </Card>

      {groups.map(group => {
        const yearMatched = !q || matchInfo.matchedYears.has(group.year);
        if (!yearMatched) return null;
        const isOpen = openYears.has(group.year) || !!q;
        const growth = group.endNetWorth - group.startNetWorth;
        const visibleMonths = q
          ? group.months.filter(m => matchInfo.matchedMonths.has(m.monthIndex))
          : group.months;

        return (
          <div key={group.year} className="rounded-card border border-white/10 bg-surface/30 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleYear(group.year)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5 transition-colors focus-ring text-left"
            >
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className={`text-ink-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                <span className="text-h2 text-ink-50 font-bold">{group.year}</span>
                {typeof group.age === 'number' && <span className="text-meta text-ink-400">{group.age} ans</span>}
              </div>
              <div className="text-right">
                <div className="text-body text-ink-50 font-bold font-mono">{fmt(group.endNetWorth)}</div>
                <div className={`text-tiny font-mono ${growth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtSigned(growth)} cette année
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-white/5 divide-y divide-white/5">
                {visibleMonths.map(m => {
                  const rows = matchInfo.rowsByMonth.get(m.monthIndex) ?? [];
                  const events = [...(m.flowEvents ?? []), ...(m.lifeEvents ?? [])];
                  const moved = rows.filter(r => r.parts.length > 0);
                  return (
                    <div key={m.monthIndex} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className="text-meta font-bold text-ink-100">{m.dateLabel}</span>
                        <span className="text-meta font-mono text-ink-300">{fmt(m.NetWorth)}</span>
                      </div>

                      {events.length > 0 && (
                        <ul className="space-y-0.5 mb-2">
                          {events.map((ev, i) => (
                            <li key={i} className="text-meta text-ink-200 leading-snug">{ev}</li>
                          ))}
                        </ul>
                      )}

                      {moved.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {moved.map(r => (
                            <span key={r.account} className="text-tiny text-ink-400">
                              <span className="text-ink-300 font-medium">{r.account}</span>
                              {' '}{r.parts.join(' · ')}
                            </span>
                          ))}
                        </div>
                      )}

                      {events.length === 0 && moved.length === 0 && (
                        <p className="text-tiny text-ink-500 italic">Mois sans mouvement notable.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Méthodologie : comment ça marche (concepts) */}
      <Card title="🎓 Comment ça marche">
        <button
          type="button"
          onClick={() => setShowMethodo(v => !v)}
          aria-expanded={showMethodo}
          className="text-meta font-bold text-primary hover:brightness-110 focus-ring rounded"
        >
          {showMethodo ? 'Masquer' : 'Afficher'} les explications des concepts
        </button>
        {showMethodo && (
          <dl className="mt-3 space-y-3">
            {METHODOLOGY.map((item, i) => (
              <div key={i}>
                <dt className="text-body font-bold text-ink-100">{item.q}</dt>
                <dd className="text-meta text-ink-300 leading-relaxed mt-0.5">{item.a}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
};
