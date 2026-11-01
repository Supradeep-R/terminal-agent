import React, { useState } from 'react';
import { FileCode, Check, Copy, ChevronDown, ChevronUp, Brain, Zap, GitCommit, Loader2 } from 'lucide-react';

export default function DiffViewerCard({ step }) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const isExecuting = step.output === null || step.output === undefined;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(step.output || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const diffLines = (step.output || '').split('\n');

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#383838] bg-[#141414] shadow-lg font-sans">
      {/* Title Bar */}
      <div 
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#1a1e24] border-b border-[#2d3748] cursor-pointer select-none hover:bg-[#20252e] transition"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Traffic lights */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-[#a3a3a3] ml-1 min-w-0">
            <FileCode className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
            <span className="font-semibold text-white shrink-0">Step {step.step_number}</span>
            <span>•</span>
            <span className="text-[#38bdf8] font-mono truncate max-w-[200px] sm:max-w-md">
              {step.command}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {step.model_name && (
            <span className="text-[10px] hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full font-mono bg-[#1e293b]/60 text-[#93c5fd] border border-[#3b82f6]/30">
              <Zap className="w-2.5 h-2.5" />
              <span>{step.model_name}</span>
            </span>
          )}

          {isExecuting ? (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5 bg-[#0369a1]/30 text-[#38bdf8] border border-[#0284c7]/40 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-[#38bdf8]" />
              <span>Patching...</span>
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 bg-[#1e293b] text-[#38bdf8] border border-[#0284c7]/30">
              <GitCommit className="w-3 h-3" />
              <span>Diff Patch</span>
            </span>
          )}

          <button
            onClick={handleCopy}
            title="Copy Unified Diff"
            className="p-1 rounded hover:bg-[#333333] text-[#9ca3af] hover:text-white transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button className="text-[#9ca3af] hover:text-white">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3.5 text-xs font-mono space-y-3">
          {/* Reasoning / Intent */}
          {step.thought && (
            <div className="rounded-lg bg-[#18181b] border border-[#27272a] p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[#c084fc] mb-1">
                <Brain className="w-4 h-4 text-[#c084fc]" />
                <span className="font-sans text-xs">Code Modification Reasoning</span>
              </div>
              <p className="text-[#e4e4e7] font-sans leading-relaxed text-xs">
                {step.thought}
              </p>
            </div>
          )}

          {/* Visual Unified Diff Table */}
          <div className="rounded-lg bg-[#0b0f17] border border-[#1e293b] overflow-x-auto max-h-96">
            <div className="p-2.5 border-b border-[#1e293b] text-[11px] text-[#64748b] font-sans flex items-center justify-between">
              <span>Unified Diff (Git Patch Format):</span>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-red-400 font-mono">- Deletion</span>
                <span className="text-emerald-400 font-mono">+ Addition</span>
              </div>
            </div>

            {isExecuting ? (
              <div className="p-4 flex items-center gap-2.5 text-[#38bdf8] font-mono text-xs">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="animate-pulse">Analyzing file and applying atomic diff patch...</span>
              </div>
            ) : (
              <div className="p-2 select-text font-mono text-[11px] leading-relaxed">
                {diffLines.map((line, idx) => {
                  let lineStyle = 'text-[#94a3b8]';
                  if (line.startsWith('+') && !line.startsWith('+++')) {
                    lineStyle = 'bg-[#14532d]/40 text-[#4ade80] px-1 rounded-xs font-semibold block';
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    lineStyle = 'bg-[#7f1d1d]/40 text-[#f87171] px-1 rounded-xs block';
                  } else if (line.startsWith('@@')) {
                    lineStyle = 'text-[#38bdf8] bg-[#0c4a6e]/20 px-1 rounded-xs font-bold block my-1';
                  } else if (line.startsWith('---') || line.startsWith('+++')) {
                    lineStyle = 'text-[#94a3b8] font-bold block';
                  }

                  return (
                    <div key={idx} className={lineStyle}>
                      {line}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
