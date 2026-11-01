import React, { useState } from 'react';
import { Terminal, Check, Copy, ChevronDown, ChevronUp, AlertCircle, Sparkles } from 'lucide-react';

export default function TerminalCard({ step }) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const isSuccess = step.output && !step.output.includes('[Exit Code: -1]') && !step.output.toLowerCase().includes('error:');

  const handleCopy = (e) => {
    e.stopPropagation();
    const textToCopy = `> ${step.command}\n${step.output || ''}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#383838] bg-[#141414] shadow-lg font-sans">
      {/* Terminal Title Bar */}
      <div 
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#1e1e1e] border-b border-[#2e2e2e] cursor-pointer select-none hover:bg-[#252525] transition"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5">
          {/* Traffic light dots */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-[#a3a3a3] ml-1">
            <Terminal className="w-3.5 h-3.5 text-[#60a5fa]" />
            <span className="font-semibold text-[#e5e5e5]">Step {step.step_number}</span>
            <span>•</span>
            <span className="text-[#93c5fd] font-mono truncate max-w-[280px] sm:max-w-md">
              {step.command}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status pill */}
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
            isSuccess 
              ? 'bg-[#14532d]/60 text-[#4ade80] border border-[#22c55e]/30' 
              : 'bg-[#7f1d1d]/60 text-[#f87171] border border-[#ef4444]/30'
          }`}>
            {isSuccess ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            {isSuccess ? 'Exit 0' : 'Failed'}
          </span>

          <button
            onClick={handleCopy}
            title="Copy command & output"
            className="p-1 rounded hover:bg-[#333333] text-[#9ca3af] hover:text-white transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button className="text-[#9ca3af] hover:text-white">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="p-3.5 text-xs font-mono">
          {/* AI Thought if present */}
          {step.thought && (
            <div className="mb-2.5 flex items-start gap-1.5 text-[#9ca3af] bg-[#1a1a1a] p-2 rounded-lg border border-[#262626]">
              <Sparkles className="w-3.5 h-3.5 text-[#a855f7] mt-0.5 shrink-0" />
              <span className="leading-relaxed">{step.thought}</span>
            </div>
          )}

          {/* Command Prompt Line */}
          <div className="flex items-center gap-2 text-[#4ade80] pb-2 font-semibold">
            <span className="text-[#60a5fa]">$</span>
            <span className="text-white">{step.command}</span>
          </div>

          {/* Terminal Output */}
          <div className="bg-[#0b0b0b] rounded-lg p-3 border border-[#222222] overflow-x-auto max-h-80 text-[#d4d4d4] leading-relaxed whitespace-pre-wrap select-text">
            {step.output || <span className="text-[#737373] italic">(No output produced)</span>}
          </div>
        </div>
      )}
    </div>
  );
}
