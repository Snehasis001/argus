import React, { useState } from 'react';
import axios from 'axios';
import { FileText, ShieldAlert, CheckCircle, Clock, Send, ThumbsDown, UserCheck, AlertOctagon } from 'lucide-react';

export default function CaseFile({ selectedCase, onCaseUpdated }) {
  const [submitting, setSubmitting] = useState(false);

  if (!selectedCase) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0d131f] border border-[#1e293b] rounded-lg p-6 text-slate-500 text-xs">
        <FileText size={32} className="mb-2 text-slate-600" />
        <p>Select a case from the queue to view its findings and take action.</p>
      </div>
    );
  }

  const tx = selectedCase.transactionId || {};
  const isPending = selectedCase.status === 'pending';

  const handleDecision = async (status) => {
    setSubmitting(true);
    try {
      const res = await axios.patch(`/api/cases/${selectedCase._id}`, {
        status,
        reviewedBy: 'Compliance Officer (Officer #842)'
      });
      if (onCaseUpdated) {
        onCaseUpdated(res.data);
      }
    } catch (err) {
      console.error('Failed to submit compliance decision:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 75) return 'text-red-400 bg-red-950/70 border-red-700';
    if (score >= 45) return 'text-amber-400 bg-amber-950/70 border-amber-700';
    return 'text-emerald-400 bg-emerald-950/70 border-emerald-700';
  };

  return (
    <div className="flex flex-col h-full bg-[#0d131f] border border-[#1e293b] rounded-lg overflow-hidden">
      {/* Case Header */}
      <div className="p-4 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-cyan-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Investigation Dossier
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Ref ID: {selectedCase._id}
            </p>
          </div>
        </div>

        {/* Risk Score Gauge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Risk Score:</span>
          <span
            className={`text-sm font-bold font-mono px-2.5 py-1 rounded-md border ${getScoreColor(
              selectedCase.riskScore
            )}`}
          >
            {selectedCase.riskScore} / 100
          </span>
        </div>
      </div>

      {/* Dossier Content */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
        {/* Transaction Summary Card */}
        <div className="bg-[#111827] p-3 rounded-md border border-slate-800">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Target Transaction Profile
          </div>
          <div className="grid grid-cols-2 gap-2 text-slate-300 font-mono">
            <div>
              <span className="text-slate-500 block text-[10px]">Amount (USD)</span>
              <span className="text-base font-bold text-slate-100">
                ${(tx.amountUSD || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Payment Channel</span>
              <span>{tx.paymentFormat || 'ACH'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Sender Account</span>
              <span className="truncate block" title={tx.fromAccount}>
                {tx.fromAccount || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Receiver Account</span>
              <span className="truncate block" title={tx.toAccount}>
                {tx.toAccount || 'N/A'}
              </span>
            </div>
          </div>
          {tx.narration && (
            <div className="mt-2 pt-2 border-t border-slate-800/80">
              <span className="text-slate-500 block text-[10px]">Payment Memo / Narration</span>
              <span className="italic text-slate-300">"{tx.narration}"</span>
            </div>
          )}
        </div>

        {/* Agent Evidence Findings */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <AlertOctagon size={14} className="text-amber-400" />
            Empirical Evidence Collected
          </div>
          {selectedCase.investigated && selectedCase.evidence && selectedCase.evidence.length > 0 ? (
            <ul className="space-y-1.5">
              {selectedCase.evidence.map((item, idx) => (
                <li
                  key={idx}
                  className="p-2 rounded bg-[#090d16] border border-slate-800/80 text-slate-200 flex items-start gap-2"
                >
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-3 rounded bg-[#090d16] border border-dashed border-slate-800 text-slate-500 italic text-xs flex items-center gap-2">
              <Clock size={14} className="text-amber-500/70" />
              <span>Awaiting autonomous investigation. Click <strong>Run Investigation</strong> in the center panel to dispatch agent tools.</span>
            </div>
          )}
        </div>

        {/* Agent Synthesized Reasoning */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Agent Reasoning & Synthesis
          </div>
          <div className="p-3.5 rounded bg-[#090d16] border border-slate-800 text-slate-300 leading-relaxed font-sans text-xs max-h-72 overflow-y-auto">
            {selectedCase.investigated && selectedCase.reasoningTrace && selectedCase.reasoningTrace.length > 0 ? (
              selectedCase.reasoningTrace.map((r, i) => (
                <p key={i} className="whitespace-pre-line leading-relaxed">
                  {typeof r === 'string' ? r : JSON.stringify(r)}
                </p>
              ))
            ) : (
              <div className="p-2 text-slate-500 italic flex items-center gap-2">
                <Clock size={14} className="text-amber-500/70" />
                <span>Forensic synthesis and final compliance conclusion report will generate here after the investigation runs.</span>
              </div>
            )}
          </div>
        </div>

        {/* Recommended Action Badge */}
        <div className="flex items-center justify-between p-3 rounded bg-[#111827] border border-slate-800">
          <span className="text-slate-400 text-xs font-medium">Recommended Action:</span>
          <span
            className={`font-mono text-xs font-bold uppercase px-2.5 py-1 rounded border ${
              !selectedCase.investigated
                ? 'bg-slate-900 text-slate-400 border-slate-700'
                : selectedCase.verdict === 'escalate'
                ? 'bg-red-950/80 text-red-300 border-red-800'
                : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
            }`}
          >
            {!selectedCase.investigated ? 'PENDING INVESTIGATION' : selectedCase.verdict || 'ESCALATE'}
          </span>
        </div>
      </div>

      {/* Decision Footer: Approve / Dismiss */}
      <div className="p-4 bg-[#090d16] border-t border-[#1e293b] flex items-center justify-between gap-3">
        {isPending ? (
          <>
            <button
              onClick={() => handleDecision('dismissed')}
              disabled={submitting || !selectedCase.investigated}
              className="flex-1 py-2 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title={!selectedCase.investigated ? 'Run investigation first' : 'Dismiss case'}
            >
              <CheckCircle size={14} className="text-emerald-400" />
              Dismiss (Clear)
            </button>
            <button
              onClick={() => handleDecision('approved')}
              disabled={submitting || !selectedCase.investigated}
              className="flex-1 py-2 px-3 rounded bg-red-600 hover:bg-red-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
              title={!selectedCase.investigated ? 'Run investigation first' : 'Escalate to SAR'}
            >
              <ShieldAlert size={14} />
              Approve (Escalate to SAR)
            </button>
          </>
        ) : (
          <div className="w-full flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <UserCheck size={14} className="text-cyan-400" />
              Reviewed: <strong className="capitalize text-slate-200">{selectedCase.status}</strong>
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              {selectedCase.reviewedBy || 'Officer #842'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
