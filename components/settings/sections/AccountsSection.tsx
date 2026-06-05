// components/settings/sections/AccountsSection.tsx
// G22-N4 — extrait de Settings.tsx : soldes initiaux des comptes, upload IA de
// relevé de salaire (Vision Claude) et import de relevé bancaire.
// CFG-COMPTES (2026-06) — regroupé : les 2 sources d'import côte à côte, puis les
// soldes de départ ; en-têtes clairs, texte allégé, tokens.

import React from 'react';
import { Card } from '../../ui/Card';
import { PayslipUploadCard } from '../PayslipUploadCard';
import { ImportBankStatement } from '../../import/ImportBankStatement';
import type { Transaction } from '../../../types';

interface AccountsSectionProps {
  initialBalances: Record<string, number>;
  setInitialBalances: (balances: Record<string, number>) => void;
  transactions: Transaction[];
  onImportData: (data: string) => void;
}

export const AccountsSection: React.FC<AccountsSectionProps> = ({
  initialBalances, setInitialBalances, transactions, onImportData,
}) => {
  const knownAccounts = React.useMemo(() => {
    const accs: Record<string, boolean> = {};
    transactions.forEach(t => {
      if (t.accountName && t.accountName !== 'Unknown') accs[t.accountName] = true;
    });
    Object.keys(initialBalances).forEach(k => accs[k] = true);
    return accs;
  }, [transactions, initialBalances]);
  const hasAccounts = Object.keys(knownAccounts).length > 0;

  return (
    <div className="space-y-5">
      <header>
        <h3 className="text-h2 text-ink-50">Comptes &amp; données</h3>
        <p className="text-meta text-ink-400 mt-0.5">
          Importe tes revenus et transactions, puis fixe tes soldes de départ. Tout reste local.
        </p>
      </header>

      {/* Deux sources d'import regroupées côte à côte, MÊME taille (hauteurs égales) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <PayslipUploadCard className="h-full" />
        <ImportBankStatement onImport={onImportData} className="h-full" />
      </div>

      <Card title="Soldes de départ">
        <div className="space-y-4">
          <p className="text-meta text-ink-400">
            Le point de départ « cash » de la projection —{' '}
            <span className="text-warning-400">le solde actuel de chaque compte (chèque, épargne).</span>
          </p>

          {hasAccounts ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(knownAccounts).map(acc => (
                <div key={acc}>
                  <label className="block text-meta text-ink-300 mb-1">{acc}</label>
                  <input
                    type="number"
                    value={initialBalances[acc] || 0}
                    onChange={(e) => setInitialBalances({ ...initialBalances, [acc]: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-ink-500 text-meta italic">Aucun compte détecté — importe d'abord des transactions.</div>
          )}
        </div>
      </Card>
    </div>
  );
};
