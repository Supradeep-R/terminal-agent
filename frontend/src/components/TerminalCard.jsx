import React, { useState } from 'react';
import { 
  Terminal, Check, Copy, ChevronDown, ChevronUp, AlertCircle, 
  Sparkles, Brain, Wrench, AlertTriangle, Zap, CheckCircle2, Loader2, Send 
} from 'lucide-react';
import { sendTerminalInput } from '../api';

export default function TerminalCard({ step, sessionId }) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [stdinText, setStdinText] = useState('');
  const [isSendingStdin, setIsSendingStdin] = useState(false);
  const [stdinHistory, setStdinHistory] = useState([]);

  const isExecuting = step.output === null || step.output === undefined;
  const isSuccess = !isExecuting && step.output && !step.output.includes('[Exit Code: -1]') && !step.output.toLowerCase().includes('error:');

  const handleSendStdin = async (e) => {
    e.preventDefault();
    if (!stdinText.trim() || !sessionId || isSendingStdin) return;
    const textToSend = stdinText;
    setIsSendingStdin(true);
    try {
      await sendTerminalInput(sessionId, textToSend);
      setStdinHistory(prev => [...prev, textToSend]);
      setStdinText('');
    } catch (err) {
      alert(`Error sending terminal input: ${err.message}`);
    } finally {
      setIsSendingStdin(false);
    }
  };

  // Parse routing trace if available
  let parsedTrace = [];
  try {
    if (step.routing_trace) {
      parsedTrace = typeof step.routing_trace === 'string' ? JSON.parse(step.routing_trace) : step.routing_trace;
    }
  } catch (e) {
    parsedTrace = [];
  }

  const failedAttempt = Array.isArray(parsedTrace) ? parsedTrace.find(t => t.status === 'failed') : null;
  const isFallback = Boolean(failedAttempt);

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
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Traffic light dots */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-[#a3a3a3] ml-1 min-w-0">
            <Terminal className="w-3.5 h-3.5 text-[#60a5fa] shrink-0" />
            <span className="font-semibold text-[#e5e5e5] shrink-0">Step {step.step_number}</span>
            <span>•</span>
            <span className="text-[#93c5fd] font-mono truncate max-w-[180px] sm:max-w-xs md:max-w-md">
              {step.command}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Active Model Pill */}
          {step.model_name && (
            <span className={`text-[10px] hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full font-mono border ${
              isFallback 
                ? 'bg-[#78350f]/40 text-[#fde047] border-[#ca8a04]/40' 
                : 'bg-[#1e293b]/60 text-[#93c5fd] border-[#3b82f6]/30'
            }`}>
              <Zap className="w-2.5 h-2.5" />
              <span>{isFallback ? 'Fallback: ' : ''}{step.model_name}</span>
            </span>
          )}

          {/* Status pill */}
          {isExecuting ? (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5 bg-[#1e3a8a]/60 text-[#60a5fa] border border-[#3b82f6]/40 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-[#38bdf8]" />
              <span>Running...</span>
            </span>
          ) : (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
              isSuccess 
                ? 'bg-[#14532d]/60 text-[#4ade80] border border-[#22c55e]/30' 
                : 'bg-[#7f1d1d]/60 text-[#f87171] border border-[#ef4444]/30'
            }`}>
              {isSuccess ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              {isSuccess ? 'Exit 0' : 'Failed'}
            </span>
          )}

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
        <div className="p-3.5 text-xs font-mono space-y-3">
          {/* Multi-Provider Fallback Alert Banner (When rate-limited or failed) */}
          {isFallback && failedAttempt && (
            <div className="rounded-lg bg-gradient-to-r from-[#451a03]/90 to-[#2e1065]/90 border border-[#b45309]/60 p-3 text-xs text-[#fed7aa] space-y-1.5 shadow-md">
              <div className="flex items-center gap-2 font-semibold text-[#fef3c7]">
                <AlertTriangle className="w-4 h-4 text-[#fbbf24] shrink-0" />
                <span>Multi-Provider Fallback Activated</span>
                <span className="text-[10px] bg-[#78350f] text-[#fef08a] px-2 py-0.5 rounded font-mono font-bold">
                  {failedAttempt.is_rate_limit ? 'HTTP 429 Rate Limit' : 'Provider Error'}
                </span>
              </div>
              <p className="text-[11px] text-[#fde68a]/90 font-sans leading-relaxed">
                Primary model <span className="font-semibold text-white underline">{failedAttempt.provider} ({failedAttempt.model})</span> {failedAttempt.is_rate_limit ? 'exceeded rate limit quota' : 'encountered an issue'}. The LLM Router autonomously transferred execution to <span className="font-semibold text-emerald-300 underline">{step.model_name || 'fallback model'}</span> without interrupting the session.
              </p>
            </div>
          )}

          {/* Model & Routing Bar for Mobile / Clear Overview */}
          {step.model_name && (
            <div className="flex sm:hidden items-center gap-1.5 text-[11px] text-[#94a3b8] bg-[#1e293b]/30 p-2 rounded-lg border border-[#334155]/30">
              <Zap className="w-3 h-3 text-[#38bdf8]" />
              <span>Served by: <strong className="text-white">{step.model_name}</strong></span>
            </div>
          )}

          {/* LLM Chain-of-Thought Reasoning Box */}
          {step.thought && (
            <div className="rounded-lg bg-[#18181b] border border-[#27272a] p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[#c084fc] mb-1.5">
                <Brain className="w-4 h-4 text-[#c084fc]" />
                <span className="font-sans text-xs tracking-wide">LLM Reasoning & Intent</span>
              </div>
              <p className="text-[#e4e4e7] font-sans leading-relaxed text-xs">
                {step.thought}
              </p>
            </div>
          )}

          {/* Tool Call Inspection */}
          <div className="rounded-lg bg-[#0f172a]/60 border border-[#1e293b] p-2.5">
            <div className="flex items-center justify-between text-[#94a3b8] text-[11px] mb-1.5">
              <span className="flex items-center gap-1.5 font-sans font-medium text-[#38bdf8]">
                <Wrench className="w-3.5 h-3.5 text-[#38bdf8]" />
                Tool Invoked: <span className="font-mono text-white">run_terminal_command</span>
              </span>
              <span className="text-[10px] text-[#64748b] font-mono">
                PowerShell Sandbox
              </span>
            </div>
            <div className="text-[#38bdf8] bg-[#020617] px-3 py-2 rounded-md border border-[#1e293b]/70 flex items-center gap-2">
              <span className="text-[#60a5fa] font-bold">$</span>
              <span className="font-bold text-white break-all">{step.command}</span>
            </div>
          </div>

          {/* Terminal Output */}
          <div className="space-y-1">
            <div className="text-[11px] text-[#71717a] font-sans font-medium flex items-center justify-between">
              <span>Terminal Sandbox Output:</span>
              <span className="text-[10px] text-[#52525b]">stdout + stderr</span>
            </div>
            {isExecuting ? (
              <div className="space-y-2">
                <div className="bg-[#0b0b0b] rounded-lg p-3.5 border border-[#222222] flex items-center gap-2.5 text-[#60a5fa] font-mono text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#38bdf8] shrink-0" />
                  <span className="animate-pulse">
                    Executing command on {step.model_name?.includes('Local') ? 'Local Machine' : 'Cloud Sandbox'}...
                  </span>
                </div>

                {sessionId && (
                  <div className="bg-[#18181b] rounded-lg p-2.5 border border-[#3b82f6]/40 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[#93c5fd]">
                      <span className="font-semibold flex items-center gap-1.5 font-sans">
                        <Terminal className="w-3.5 h-3.5 text-[#60a5fa]" />
                        Interactive Terminal Prompt
                      </span>
                      <span className="text-[10px] text-[#9ca3af] font-sans">Send input if command pauses</span>
                    </div>

                    <form onSubmit={handleSendStdin} className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#60a5fa] font-mono text-xs font-bold">&gt;</span>
                        <input
                          type="text"
                          value={stdinText}
                          onChange={(e) => setStdinText(e.target.value)}
                          placeholder="Respond to prompt (e.g. Y, value, Enter)..."
                          className="w-full bg-[#09090b] border border-[#27272a] rounded-md pl-7 pr-2.5 py-1.5 text-xs text-white placeholder-[#71717a] font-mono focus:outline-none focus:border-[#3b82f6]"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!stdinText.trim() || isSendingStdin}
                        className="px-3 py-1.5 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-medium font-sans flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        {isSendingStdin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Send</span>
                      </button>
                    </form>

                    {stdinHistory.length > 0 && (
                      <div className="text-[11px] text-[#4ade80] font-mono flex flex-wrap gap-1.5 pt-1">
                        {stdinHistory.map((h, i) => (
                          <span key={i} className="bg-[#14532d]/40 px-2 py-0.5 rounded border border-[#22c55e]/30">
                            Sent: &quot;{h}&quot;
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#0b0b0b] rounded-lg p-3 border border-[#222222] overflow-x-auto max-h-80 text-[#d4d4d4] leading-relaxed whitespace-pre-wrap select-text font-mono text-xs">
                {step.output || <span className="text-[#737373] italic">(No output produced)</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
