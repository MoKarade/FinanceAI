// components/settings/sections/IntegrationsSection.tsx
// G22-N4 — extrait de Settings.tsx : clés API & services externes (Anthropic,
// Finnhub). Comportement identique ; props apiKeys/setApiKeys threadées.

import React from 'react';
import { Card } from '../../ui/Card';
import { ClaudeConnectorCard } from '../ClaudeConnectorCard';
import type { AppState } from '../../../types';

interface IntegrationsSectionProps {
  apiKeys: AppState['apiKeys'];
  setApiKeys: (keys: AppState['apiKeys']) => void;
}

export const IntegrationsSection: React.FC<IntegrationsSectionProps> = ({ apiKeys, setApiKeys }) => {
  return (
    <div className="space-y-6">
    <Card title="Cles API & Services">
      <div className="space-y-4">
        <div data-focus-section="apiKeys-anthropic">
          <label htmlFor="apikey-anthropic" className="block text-body text-ink-300 mb-1">Anthropic API Key (Claude)</label>
          <input
            id="apikey-anthropic"
            type="password"
            value={apiKeys?.anthropic || ''}
            onChange={(e) => setApiKeys({ ...apiKeys, anthropic: e.target.value })}
            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
            placeholder="sk-ant-..."
            aria-describedby="apikey-anthropic-format"
          />
          {apiKeys?.anthropic && (
            <div id="apikey-anthropic-format" className="text-meta mt-1" role="status" aria-live="polite">
              {apiKeys.anthropic.startsWith('sk-ant-') && apiKeys.anthropic.length >= 20
                ? <span className="text-green-400">Format valide</span>
                : <span className="text-yellow-400">Format inattendu (devrait commencer par <code className="bg-white/10 px-1 rounded">sk-ant-</code>)</span>
              }
            </div>
          )}
          <p className="text-meta text-ink-500 mt-1">Pour Claude Sonnet/Haiku — analyse, catégorisation, vision. Obtenez votre clé sur <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-info-400 underline">console.anthropic.com</a></p>
        </div>
        <div>
          <label htmlFor="apikey-finnhub" className="block text-body text-ink-300 mb-1">Finnhub API Key (Données boursières)</label>
          <input
            id="apikey-finnhub"
            type="password"
            value={apiKeys?.finnhub || ''}
            onChange={(e) => setApiKeys({ ...apiKeys, finnhub: e.target.value })}
            className="w-full bg-dark border border-border rounded px-3 py-2 text-white focus:border-primary outline-none"
            placeholder="d12abc..."
            aria-describedby="apikey-finnhub-format"
          />
          {apiKeys?.finnhub && (
            <div id="apikey-finnhub-format" className="text-meta mt-1" role="status" aria-live="polite">
              {/^[a-z0-9]{15,}$/i.test(apiKeys.finnhub)
                ? <span className="text-green-400">Format valide</span>
                : <span className="text-yellow-400">Format inattendu (alphanumeric ≥ 15 chars)</span>
              }
            </div>
          )}
          <p className="text-meta text-ink-500 mt-1">
            §7.F : remplace l'ancien Google Sheet hardcodé. Quotes + historique + profils
            d'actifs à jour quotidiennement via <a href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer" className="text-info-400 underline">finnhub.io</a> (gratuit, 60 req/min).
            Optionnel : sans clé, fallback sur le Google Sheet legacy.
          </p>
        </div>
        <div className="p-3 bg-info-bg rounded border border-info-border mt-4">
          <div className="text-meta text-info-400 font-bold mb-1">ℹ️ Source de données actives</div>
          <p className="text-tiny text-ink-300">
            {apiKeys?.finnhub
              ? <>Finnhub configuré → quotes/profils dynamiques. Google Sheet en fallback.</>
              : <>Google Sheet uniquement (mode legacy). Ajoutez une clé Finnhub pour des données dynamiques.</>
            }
          </p>
        </div>
      </div>
    </Card>

      {/* CFG-SAUVE — « Connecter à Claude » déplacé ici (intégration), retiré de Sauvegarde */}
      <ClaudeConnectorCard />
    </div>
  );
};
