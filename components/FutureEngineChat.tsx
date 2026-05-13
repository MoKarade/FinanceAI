import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, MessageSquare } from 'lucide-react';
import { useFutureEngine } from '../hooks/useFutureEngine';
import { AuditCard } from './AuditCard';

export const FutureEngineChat: React.FC = () => {
  const [query, setQuery] = useState('');
  const { simulate, result, isLoading, error } = useFutureEngine();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || isLoading) return;
    await simulate(query);
  };

  return (
    <div className="w-full space-y-6">
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
        <form 
          onSubmit={handleSubmit}
          className="relative bg-gray-900 border border-white/10 rounded-2xl p-2 flex items-center shadow-2xl"
        >
          <div className="flex-shrink-0 ml-3 text-blue-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Posez une question sur votre futur financier..."
            className="w-full bg-transparent border-none focus:ring-0 text-white placeholder-gray-500 px-4 py-3 text-lg"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className={`p-3 rounded-xl transition-all ${
              query.trim() && !isLoading ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-800 text-gray-600'
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>

      <div className="min-h-[100px]">
        {(isLoading || result) && (
          <AuditCard result={result as any} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
};
