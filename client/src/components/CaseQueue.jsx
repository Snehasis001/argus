import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { socket } from '../lib/socket';
import { AlertTriangle, ShieldAlert, CheckCircle, Clock, ChevronRight, RefreshCw } from 'lucide-react';

export default function CaseQueue({ selectedCase, onSelectCase }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'dismissed'

  const fetchCases = async (forceRefresh = false) => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/cases${forceRefresh ? '?refresh=true' : ''}`);
      setCases(res.data);
      if (res.data.length > 0 && (!selectedCase || forceRefresh)) {
        onSelectCase(res.data[0]);
      }
    } catch (err) {
      console.error('Failed to load cases:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();

    // Listen for live socket updates
    const handleCaseUpdated = (updatedCase) => {
      setCases((prev) =>
        prev.map((c) => (c._id === updatedCase._id ? { ...c, ...updatedCase } : c))
      );
    };

    const handleNewInvestigation = (newCase) => {
      setCases((prev) => {
        const exists = prev.some((c) => c._id === newCase._id);
        if (exists) {
          return prev.map((c) => (c._id === newCase._id ? newCase : c));
        }
        return [newCase, ...prev].sort((a, b) => b.riskScore - a.riskScore);
      });
    };

    socket.on('case-updated', handleCaseUpdated);
    socket.on('investigation-complete', handleNewInvestigation);

    return () => {
      socket.off('case-updated', handleCaseUpdated);
      socket.off('investigation-complete', handleNewInvestigation);
    };
  }, []);

  const filteredCases = cases.filter((c) => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const getRiskColor = (score) => {
    if (score >= 75) return 'text-red-400 bg-red-950/60 border-red-800/80';
    if (score >= 45) return 'text-amber-400 bg-amber-950/60 border-amber-800/80';
    return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80';
  };

  const getStatusBadge = (c) => {
    if (c.status === 'approved') {
      return (
        <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-700/50">
          <ShieldAlert size={12} /> SAR Escalated
        </span>
      );
    }
    if (c.status === 'dismissed') {
      return (
        <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
          <CheckCircle size={12} /> Cleared
        </span>
      );
    }
    if (c.investigated) {
      return c.verdict === 'escalate' ? (
        <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-red-950/70 text-red-400 border border-red-800">
          <AlertTriangle size={12} /> SAR Rec.
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800">
          <CheckCircle size={12} /> Dismiss Rec.
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700">
        <Clock size={12} /> Pending Review
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0d131f] border-r border-[#1e293b]">
      {/* Header */}
      <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-400" />
            Triage Case Queue
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {filteredCases.length} case{filteredCases.length !== 1 ? 's' : ''} requiring investigation
          </p>
        </div>
        <button
          onClick={() => fetchCases(true)}
          disabled={loading}
          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          title="Sample Brand New Batch of Cases"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-[#1e293b] bg-[#090d16] text-xs font-medium">
        {['all', 'pending', 'approved', 'dismissed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 text-center capitalize transition-colors ${
              filter === f
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Case List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
        {loading && cases.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">Loading cases...</div>
        ) : filteredCases.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">No cases match the selected filter.</div>
        ) : (
          filteredCases.map((c) => {
            const isSelected = selectedCase && selectedCase._id === c._id;
            const tx = c.transactionId || {};

            return (
              <div
                key={c._id}
                onClick={() => onSelectCase(c)}
                className={`p-3.5 cursor-pointer transition-all border-l-2 ${
                  isSelected
                    ? 'bg-slate-800/60 border-cyan-400 shadow-inner'
                    : 'border-transparent hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold font-mono px-2 py-0.5 rounded border ${getRiskColor(
                        c.riskScore
                      )}`}
                    >
                      {c.riskScore}/100
                    </span>
                    <span className="text-sm font-semibold text-slate-100 font-mono">
                      ${(tx.amountUSD || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {getStatusBadge(c)}
                </div>

                <div className="mt-2 text-xs text-slate-400 font-mono flex items-center justify-between">
                  <span className="truncate max-w-[130px]" title={tx.fromAccount}>
                    {tx.fromAccount || 'Unknown'}
                  </span>
                  <span className="text-slate-500 mx-1">→</span>
                  <span className="truncate max-w-[130px]" title={tx.toAccount}>
                    {tx.toAccount || 'Unknown'}
                  </span>
                </div>

                {tx.narration && (
                  <p className="mt-1.5 text-xs text-slate-400 italic line-clamp-1">
                    "{tx.narration}"
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{tx.paymentFormat || 'ACH'}</span>
                  <span>{new Date(tx.timestamp || c.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
