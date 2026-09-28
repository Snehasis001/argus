import React, { useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import axios from 'axios';
import { Network, RefreshCw, AlertCircle } from 'lucide-react';

export default function GraphView({ selectedCase }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [], cycles: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 350 });
  const containerRef = useRef(null);
  const graphRef = useRef(null);

  const accountId = selectedCase?.transactionId?.fromAccount;

  // Track parent container dimensions dynamically
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth || 600,
          height: containerRef.current.offsetHeight || 350
        });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!accountId) return;

    const loadGraph = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/graph/${accountId}?hops=2`);
        setGraphData(res.data);
      } catch (err) {
        console.error('Failed to load graph data:', err);
        setError('Failed to load transaction network');
      } finally {
        setLoading(false);
      }
    };

    loadGraph();
  }, [accountId]);

  const cycleCount = graphData.cycles ? graphData.cycles.length : 0;

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full bg-[#080c14] relative overflow-hidden border border-[#1e293b] rounded-lg"
    >
      {/* Overlay Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#0f172a]/90 backdrop-blur-md px-3 py-1.5 rounded-md border border-slate-700/60 shadow-lg">
        <Network size={16} className="text-cyan-400" />
        <span className="text-xs font-semibold text-slate-200">
          2-Hop Transaction Network
        </span>
        {accountId && (
          <span className="text-xs font-mono text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800">
            {accountId}
          </span>
        )}
        {cycleCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-700 animate-pulse">
            <AlertCircle size={12} /> {cycleCount} Cycle{cycleCount > 1 ? 's' : ''} Detected (Tarjan SCC)
          </span>
        )}
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 w-full h-full relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-xs gap-2">
            <RefreshCw size={16} className="animate-spin text-cyan-400" />
            Traversing transaction network & running Tarjan SCC...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400 text-xs">
            {error}
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs">
            Select a case to inspect its transaction network
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeId="id"
            nodeLabel={(node) => `
              <div style="background:#0f172a; padding:6px 10px; border-radius:6px; border:1px solid #334155; font-size:12px; color:#f8fafc; font-family:monospace;">
                <strong>Account:</strong> ${node.id}<br/>
                ${node.inCycle ? '<span style="color:#ef4444; font-weight:bold;">⚠️ In Laundering Cycle (Tarjan SCC)</span><br/>' : ''}
                ${node.isRoot ? '<span style="color:#06b6d4; font-weight:bold;">Target Root Account</span><br/>' : ''}
                <strong>In-Degree:</strong> ${node.centrality?.inDegree || 0} | <strong>Out-Degree:</strong> ${node.centrality?.outDegree || 0}
              </div>
            `}
            nodeColor={(node) => {
              if (node.inCycle) return '#ef4444'; // Red for cycles
              if (node.isRoot) return '#06b6d4'; // Cyan for target root
              return '#64748b'; // Slate for ordinary accounts
            }}
            nodeVal={(node) => {
              if (node.isRoot) return 7;
              if (node.inCycle) return 6;
              return 4;
            }}
            linkColor={(link) => (link.inCycle ? '#ef4444' : '#334155')}
            linkWidth={(link) => (link.inCycle ? 3 : 1)}
            linkDirectionalParticles={(link) => (link.inCycle ? 4 : 0)}
            linkDirectionalParticleSpeed={0.008}
            linkDirectionalParticleColor={() => '#ef4444'}
            linkDirectionalParticleWidth={2.5}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkCurvature={0.2}
            backgroundColor="#080c14"
            cooldownTicks={100}
            onEngineStop={() => {
              if (graphRef.current) {
                graphRef.current.zoomToFit(400, 30);
              }
            }}
          />
        )}
      </div>

      {/* Legend Footer */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-4 bg-[#0f172a]/90 backdrop-blur-md px-3 py-1.5 rounded-md border border-slate-700/60 text-[11px] text-slate-300">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
          <span>Target Account</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
          <span>Laundering Cycle (Red)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
          <span>Connected Counterparty</span>
        </div>
      </div>
    </div>
  );
}
