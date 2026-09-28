import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { socket } from '../lib/socket';
import { Cpu, Play, CheckCircle2, ChevronDown, ChevronRight, Activity, Terminal, AlertTriangle } from 'lucide-react';

export default function AgentTrace({ selectedCase, onInvestigationComplete }) {
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState({});
  const traceEndRef = useRef(null);

  // Load existing logs when selectedCase changes and reset running state
  useEffect(() => {
    if (selectedCase?.agentLogs && selectedCase.agentLogs.length > 0) {
      setSteps(selectedCase.agentLogs);
    } else {
      setSteps([]);
    }
    setRunning(false);
  }, [selectedCase?._id]);

  // Listen for real-time agent-step and investigation-complete events
  useEffect(() => {
    const handleAgentStep = (step) => {
      setSteps((prev) => [...prev, step]);
      // Auto expand latest step
      setExpandedSteps((prev) => ({ ...prev, [step.step || prev.length + 1]: true }));
    };

    const handleInvestigationDone = (completedCase) => {
      setRunning(false);
      if (onInvestigationComplete && completedCase) {
        onInvestigationComplete(completedCase);
      }
    };

    socket.on('agent-step', handleAgentStep);
    socket.on('investigation-complete', handleInvestigationDone);

    return () => {
      socket.off('agent-step', handleAgentStep);
      socket.off('investigation-complete', handleInvestigationDone);
    };
  }, [onInvestigationComplete]);

  // Scroll to bottom on new steps
  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const toggleExpand = (index) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const runInvestigation = async () => {
    const txId =
      selectedCase?.transactionId?._id ||
      selectedCase?.transactionId?.transaction_id ||
      (typeof selectedCase?.transactionId === 'string' ? selectedCase?.transactionId : null) ||
      selectedCase?._id;
    if (!txId) return;

    setRunning(true);
    setSteps([]);
    try {
      const res = await axios.post(`/api/investigate/${txId}`, {}, { timeout: 12000 });
      if (onInvestigationComplete && res.data?.caseFile) {
        onInvestigationComplete(res.data.caseFile);
      }
    } catch (err) {
      console.error('Investigation execution failed:', err);
    } finally {
      setRunning(false);
    }
  };

  const getToolBadgeColor = (toolName) => {
    switch (toolName) {
      case 'get_subgraph':
        return 'text-cyan-400 bg-cyan-950/60 border-cyan-800';
      case 'detect_cycles':
        return 'text-red-400 bg-red-950/60 border-red-800';
      case 'check_structuring':
        return 'text-amber-400 bg-amber-950/60 border-amber-800';
      case 'analyze_narrations':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
      default:
        return 'text-purple-400 bg-purple-950/60 border-purple-800';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0b0f19] border border-[#1e293b] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 bg-[#0f172a] border-b border-[#1e293b] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu size={16} className="text-cyan-400" />
          <h3 className="text-xs font-semibold text-slate-200">
            Autonomous Agent Reasoning Trace
          </h3>
          {running && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 agent-live-dot"></span>
              Live Reasoning (Max 6 Steps)
            </span>
          )}
        </div>
        <button
          onClick={runInvestigation}
          disabled={running || !selectedCase}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow"
        >
          <Play size={12} className={running ? 'animate-spin' : ''} />
          {running ? 'Investigating...' : 'Run Investigation'}
        </button>
      </div>

      {/* Trace Log Body */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2.5 font-mono text-xs">
        {steps.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-8">
            <Terminal size={24} className="mb-2 text-slate-600" />
            <p>No active trace. Click "Run Investigation" to dispatch the autonomous agent.</p>
          </div>
        ) : (
          steps.map((step, idx) => {
            const stepNum = step.step || idx + 1;
            const isExpanded = expandedSteps[stepNum];

            return (
              <div
                key={idx}
                className="bg-[#111827] border border-slate-800/80 rounded-md overflow-hidden transition-all shadow-sm"
              >
                <div
                  onClick={() => toggleExpand(stepNum)}
                  className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 select-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-bold text-[11px]">#{stepNum}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getToolBadgeColor(
                        step.tool
                      )}`}
                    >
                      {step.tool}
                    </span>
                    <span className="text-slate-400 text-[11px] truncate max-w-[280px]">
                      {JSON.stringify(step.input)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="text-[10px]">
                      {step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : ''}
                    </span>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-3 bg-[#0a0f1d] border-t border-slate-800/60 text-[11px] space-y-2">
                    <div>
                      <div className="text-slate-400 font-bold text-[10px] uppercase mb-1">Tool Input</div>
                      <pre className="p-2 rounded bg-[#030712] text-cyan-300 overflow-x-auto border border-slate-800/80">
                        {JSON.stringify(step.input, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-slate-400 font-bold text-[10px] uppercase mb-1">Empirical Result</div>
                      <pre className="p-2 rounded bg-[#030712] text-emerald-300 overflow-x-auto border border-slate-800/80">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={traceEndRef} />
      </div>
    </div>
  );
}
