import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink, PlaidLinkOptions, PlaidLinkOnSuccess } from 'react-plaid-link';
import { Landmark, Link as LinkIcon, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface PlaidLinkIntegrationProps {
  userIdHash: string;
  onSuccess?: (accountsCount: number) => void;
  apiUrl?: string;
}

export const PlaidLinkIntegration: React.FC<PlaidLinkIntegrationProps> = ({ 
  userIdHash, 
  onSuccess,
  apiUrl = 'http://localhost:8000/plaid'
}) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(false);

  const fetchLinkToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/link-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id_hash: userIdHash, language: 'fr' }),
      });
      
      if (!response.ok) throw new Error('Erreur lors de la creation du link_token');
      
      const data = await response.json();
      setLinkToken(data.link_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  }, [userIdHash, apiUrl]);

  useEffect(() => {
    fetchLinkToken();
  }, [fetchLinkToken]);

  const handleOnSuccess: PlaidLinkOnSuccess = useCallback(async (publicToken, metadata) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${apiUrl}/exchange-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id_hash: userIdHash, 
          public_token: publicToken 
        }),
      });

      if (!response.ok) throw new Error('Erreur lors de l échange du token');
      
      const data = await response.json();
      setIsLinked(true);
      if (onSuccess) onSuccess(data.accounts_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la synchronisation');
    } finally {
      setIsLoading(false);
    }
  }, [userIdHash, apiUrl, onSuccess]);

  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess: handleOnSuccess,
  };

  const { open, ready } = usePlaidLink(config);

  if (isLinked) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">
        <CheckCircle className="w-5 h-5" />
        <span className="text-sm font-medium">Banque connectee (Plaid OK)</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={() => open()}
        disabled={!ready || isLoading}
        className={`w-full flex items-center justify-center gap-3 p-4 rounded-xl transition-all font-bold ${
          ready && !isLoading 
            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg' 
            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Landmark className="w-5 h-5" />
            Synchroniser via Plaid
          </>
        )}
      </button>
    </div>
  );
};
