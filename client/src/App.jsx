import React, { useState, useEffect } from 'react';
import CaseQueue from './components/CaseQueue';
import GraphView from './components/GraphView';
import AgentTrace from './components/AgentTrace';
import CaseFile from './components/CaseFile';
import { socket } from './lib/socket';
import { Shield } from 'lucide-react';

export default function App() {
  const [selectedCase, setSelectedCase] = useState(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const handleCaseUpdated = (updatedCase) => {
    setSelectedCase((prev) => (prev?._id === updatedCase._id ? { ...prev, ...updatedCase } : prev));
  };

  const handleInvestigationComplete = (newCaseFile) => {
    setSelectedCase(newCaseFile);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#070a11] text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Institutional Header */}
      <header className="h-12 bg-[#0b101c] border-b border-[#1e293b] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg">
              <Shield size={16} className="text-white" />
            </div>
            <span className="font-extrabold text-sm tracking-wide bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              ARGUS
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-400 font-medium">
            Autonomous Anti-Money Laundering Intelligence Platform
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 bg-[#0f172a] px-2.5 py-1 rounded border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-500 animate-pulse'
              }`}
            ></span>
            <span className={connected ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
              {connected ? 'LIVE CONNECTED' : 'RECONNECTING'}
            </span>
          </div>
          <span className="text-slate-500 text-[11px]">Model: Claude 3.5 Sonnet / Gemini API</span>
        </div>
      </header>

      {/* Main 3-Column Cockpit Grid */}
      <main className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        {/* Left Column: Triage Case Queue (Col 1-3) */}
        <section className="col-span-3 h-full overflow-hidden">
          <CaseQueue selectedCase={selectedCase} onSelectCase={setSelectedCase} />
        </section>

        {/* Center Column: Graph View (Top) & Real-time Agent Reasoning Trace (Bottom) (Col 4-8) */}
        <section className="col-span-5 h-full p-2 flex flex-col gap-2 overflow-hidden bg-[#090d16] border-r border-[#1e293b]">
          <div className="flex-1 min-h-[300px] overflow-hidden">
            <GraphView selectedCase={selectedCase} />
          </div>
          <div className="h-[280px] shrink-0 overflow-hidden">
            <AgentTrace
              selectedCase={selectedCase}
              onInvestigationComplete={handleInvestigationComplete}
            />
          </div>
        </section>

        {/* Right Column: Case Dossier & Human Compliance Verdicts (Col 9-12) */}
        <section className="col-span-4 h-full p-2 overflow-hidden bg-[#070a11]">
          <CaseFile selectedCase={selectedCase} onCaseUpdated={handleCaseUpdated} />
        </section>
      </main>
    </div>
  );
}
