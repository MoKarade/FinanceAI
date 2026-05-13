import { useState, useCallback } from 'react';

export interface SimulationResult {
  request_id: string;
  status: 'SUCCESS' | 'ERROR';
  computation_ms: number;
  percentiles: {
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  ruin_probability: number;
  audit_card: {
    narrative: string;
    top_factors: string[];
    model_version: string;
    compliance_status: 'APPROVED' | 'WARNING' | 'DENIED';
    regulatory_flags: string[];
  };
  triple_entry_hash: string;
}

interface UseFutureEngineReturn {
  simulate: (query: string, language?: string) => Promise<SimulationResult | null>;
  result: SimulationResult | null;
  isLoading: boolean;
  error: string | null;
  lastRequestId: string | null;
}

export const useFutureEngine = (apiUrl: string = 'http://localhost:8000'): UseFutureEngineReturn => {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);

  const simulate = useCallback(async (query: string, language: string = 'fr-CA'): Promise<SimulationResult | null> => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${apiUrl}/api/v1/simulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'React-2026',
        },
        body: JSON.stringify({
          user_query: query,
          language: language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Erreur serveur (${response.status})`);
      }

      const data: SimulationResult = await response.json();
      
      setResult(data);
      setLastRequestId(data.request_id);
      return data;

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Une erreur inattendue est survenue';
      setError(msg);
      console.error('[useFutureEngine] Simulation failed:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  return {
    simulate,
    result,
    isLoading,
    error,
    lastRequestId,
  };
};
