
import React, { useState, useMemo, useEffect } from 'react';
import { Card } from './ui/Card';
import { fetchPortfolioHistory, MarketDataPoint } from '../services/finance';

export const JsonDataView: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState<MarketDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const itemsPerPage = 50;

  useEffect(() => {
      const load = async () => {
          setIsLoading(true);
          const liveData = await fetchPortfolioHistory();
          setData(liveData);
          setIsLoading(false);
      };
      load();
  }, []);

  const columns = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  const reversedData = useMemo(() => {
    return [...data].reverse();
  }, [data]);

  const totalPages = Math.ceil(reversedData.length / itemsPerPage) || 1;
  const paginatedData = reversedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-white">Données Source (Live)</h2>
            <p className="text-sm text-gray-400">
                Visualisation brute du fichier Google Sheet connecté. Total entrées: {data.length}
            </p>
        </div>
        <div className="text-xs text-green-400 font-bold bg-green-900/20 px-3 py-1 rounded border border-green-500/30 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Connecté au Cloud
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto max-h-[75vh]">
          {isLoading ? (
              <div className="p-10 text-center text-gray-500">Chargement des données en temps réel...</div>
          ) : data.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                  <div className="text-4xl">⚠️</div>
                  <div className="text-red-400 font-bold text-lg">Aucune donnée récupérée.</div>
                  <div className="text-gray-300 text-sm max-w-md mx-auto">
                      Vérifiez que votre fichier Google Sheet est bien partagé en mode <strong>"Tous les utilisateurs ayant le lien peuvent voir"</strong>. S'il est privé, l'application ne peut pas y accéder.
                  </div>
              </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead className="bg-surface sticky top-0 z-10 shadow-md">
                <tr className="border-b border-border">
                  <th className="p-3 font-mono text-primary bg-surface min-w-[50px]">#</th>
                  {columns.map((col) => (
                    <th key={col} className="p-3 font-semibold text-gray-300 bg-surface border-l border-border/50">
                      {col.replace('TOTALPORTEFEUILLE', 'TOTAL').replace('Taux', 'Taux ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((row: any, idx) => {
                  const globalIndex = reversedData.length - ((currentPage - 1) * itemsPerPage + idx);
                  return (
                      <tr key={idx} className="border-b border-border/30 hover:bg-white/5 transition-colors">
                      <td className="p-3 text-gray-500 font-mono border-r border-border/50 sticky left-0 bg-dark/95">
                          {globalIndex}
                      </td>
                      {columns.map((col) => {
                          const val = row[col];
                          const isNumber = typeof val === 'number' || (val && /^[0-9.,-]+$/.test(String(val)));
                          return (
                              <td 
                                  key={col} 
                                  className={`p-3 border-r border-border/30 ${isNumber ? 'text-right font-mono' : ''} text-gray-300`}
                              >
                                  {isNumber && typeof val === 'number' ? val.toLocaleString('fr-CA', {maximumFractionDigits: 2}) : val}
                              </td>
                          );
                      })}
                      </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Footer Pagination */}
        <div className="p-4 border-t border-border flex justify-between items-center bg-surface">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || isLoading}
              className="px-4 py-2 rounded bg-dark border border-border text-sm disabled:opacity-50 hover:bg-white/5 transition-colors"
            >
              ← Récents
            </button>
            <span className="text-sm text-gray-400">
              Page {currentPage} sur {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || isLoading}
              className="px-4 py-2 rounded bg-dark border border-border text-sm disabled:opacity-50 hover:bg-white/5 transition-colors"
            >
              Anciens →
            </button>
        </div>
      </Card>
    </div>
  );
};
