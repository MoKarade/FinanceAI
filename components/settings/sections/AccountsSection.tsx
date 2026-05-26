// components/settings/sections/AccountsSection.tsx
// G22-N4 — extrait de Settings.tsx : soldes initiaux des comptes, upload IA de
// relevé de salaire (Vision Claude) et import de relevé bancaire. Comportement
// identique ; props threadées.

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

  return (
    <div className="space-y-6">
      <PayslipUploadCard />

      <Card title="Soldes Initiaux des Comptes">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Definissez le montant de depart de vos comptes (Chequing, Savings).
            <br /><span className="text-xs text-orange-400">Important : Ces montants definissent le point de depart "Cash".</span>
          </p>

          {Object.keys(knownAccounts).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(knownAccounts).map(acc => (
                <div key={acc}>
                  <label className="block text-xs text-gray-400 mb-1">{acc}</label>
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
            <div className="text-gray-500 text-sm italic">Aucun compte detecte. Importez des transactions d'abord.</div>
          )}
        </div>
      </Card>

      <ImportBankStatement onImport={onImportData} />
    </div>
  );
};
