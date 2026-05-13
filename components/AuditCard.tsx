import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, AlertTriangle, Info } from 'lucide-react';

interface AuditCardProps {
  result: {
    request_id: string;
    percentiles: {
      p5: number;
      p50: number;
      p95: number;
    };
    ruin_probability: number;
    audit_card: {
      narrative: string;
      top_factors: string[];
      model_version: string;
      compliance_status: string;
    };
    triple_entry_hash: string;
  };
  isLoading?: boolean;
}

export const AuditCard: React.FC<AuditCardProps> = ({ result, isLoading }) => {
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-gray-900/50 rounded-2xl border border-gray-800 animate-pulse">
        <div className="flex flex-col items-center gap-4">
          <Zap className="w-8 h-8 text-blue-400 animate-bounce" />
          <p className="text-gray-400 text-sm font-medium">L'IA de 2026 analyse votre avenir...</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const { p5, p50, p95 } = result.percentiles;
  const successRate = 100 - (result.ruin_probability * 100);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl border border-white/10 shadow-2xl"
    >
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-green-400" />
            Audit Card XAI
          </h3>
          <p className="text-gray-500 text-xs mt-1 font-mono">
            ID: {result.request_id.split('-')[0]} • Ver: {result.audit_card.model_version}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${
          result.audit_card.compliance_status === 'APPROVED' 
            ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
        }`}>
          {result.audit_card.compliance_status}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Confiance Retraite</p>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-white">{successRate.toFixed(1)}%</span>
          </div>
        </div>
        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Patrimoine Médian</p>
          <div className="flex items-end gap-1 font-bold italic">
            <span className="text-3xl text-blue-400">{p50.toLocaleString()}</span>
            <span className="text-blue-400/60 text-sm mb-1">$</span>
          </div>
        </div>
      </div>

      <div className="bg-blue-500/5 border-l-4 border-blue-500 p-4 mb-6 italic rounded-r-xl">
        <p className="text-gray-300 text-sm leading-relaxed">
          {result.audit_card.narrative}
        </p>
      </div>

      <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/10 opacity-60">
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <AlertTriangle className="w-3 h-3 text-yellow-500" />
          <span>Simulation stochastique Phase 4</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-blue-400 font-mono">
          <Info className="w-3 h-3" />
          Proof: {result.triple_entry_hash.substring(0, 16)}...
        </div>
      </div>
    </motion.div>
  );
};
