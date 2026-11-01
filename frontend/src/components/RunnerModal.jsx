import React, { useState } from 'react';
import { X, Laptop, Terminal, Copy, Check, ShieldCheck, Download, AlertCircle, ArrowRight } from 'lucide-react';

export default function RunnerModal({ isOpen, onClose, userId, runnerStatus }) {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  if (!isOpen) return null;

  const serverUrl = window.location.origin;
  const runnerCmd = `python runner.py --token ${userId} --server ${serverUrl}`;
  const curlCmd = `curl -O ${serverUrl}/runner.py`;

  const copyToClipboard = (text, setCopied) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isConnected = runnerStatus?.connected;
  const runnerInfo = runnerStatus?.info;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#18181b] border border-[#2e2e38] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in duration-150 font-sans">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              isConnected 
                ? 'bg-[#14532d]/40 border-[#22c55e]/30 text-[#4ade80]' 
                : 'bg-[#27272a] border-[#3f3f46] text-[#60a5fa]'
            }`}>
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Connect Your Local Machine</h2>
              <p className="text-xs text-[#a1a1aa]">Safely run commands on your personal laptop from the cloud agent</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#27272a] text-[#a1a1aa] hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Why this is needed explanation box */}
        <div className="rounded-xl bg-[#09090b] border border-[#27272a] p-3.5 space-y-1.5 text-xs text-[#d4d4d8] leading-relaxed">
          <div className="flex items-center gap-2 font-semibold text-[#facc15]">
            <ShieldCheck className="w-4 h-4 text-[#facc15]" />
            <span>Why do I need a Local Runner?</span>
          </div>
          <p className="text-[#a1a1aa] font-sans text-[11px] leading-relaxed">
            When Terminal Agent is hosted in the cloud (Render / AWS), the AI runs inside an isolated cloud Linux container without access to your laptop's personal files (e.g. <code className="bg-[#18181b] px-1 py-0.5 rounded text-[#e4e4e7]">C:\Users\revur\...</code>).
            Running this lightweight script opens a secure outbound WebSocket from your laptop to the cloud agent, giving it access to your local PowerShell terminal. No firewall ports are opened.
          </p>
        </div>

        {/* Live Status Indicator */}
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
          isConnected
            ? 'bg-[#14532d]/20 border-[#22c55e]/40 text-[#4ade80]'
            : 'bg-[#27272a]/50 border-[#3f3f46] text-[#9ca3af]'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${
              isConnected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#71717a]'
            }`} />
            <span>
              {isConnected 
                ? `Connected: ${runnerInfo?.platform || 'Local Machine'} (${runnerInfo?.hostname || 'Online'})` 
                : 'Waiting for Local Runner to connect...'}
            </span>
          </div>
          {isConnected && (
            <span className="text-[10px] bg-[#14532d] px-2 py-0.5 rounded text-white font-semibold">
              ACTIVE
            </span>
          )}
        </div>

        {/* Setup Steps */}
        <div className="space-y-3.5">
          {/* Step 1: Download or Curl */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-white flex items-center justify-between">
              <span>Step 1: Get the Runner script</span>
              <a
                href={`${serverUrl}/runner.py`}
                download="runner.py"
                className="text-[11px] text-[#60a5fa] hover:underline flex items-center gap-1 font-mono"
              >
                <Download className="w-3 h-3" /> Download runner.py
              </a>
            </div>
            <div className="bg-[#09090b] rounded-lg p-2.5 border border-[#27272a] flex items-center justify-between font-mono text-xs">
              <span className="text-[#93c5fd] truncate">{curlCmd}</span>
              <button
                onClick={() => copyToClipboard(curlCmd, setCopiedCurl)}
                className="p-1 rounded hover:bg-[#27272a] text-[#a1a1aa] hover:text-white shrink-0 ml-2"
                title="Copy curl command"
              >
                {copiedCurl ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Step 2: Run in terminal */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-white">
              Step 2: Run in your local terminal (PowerShell / Command Prompt)
            </div>
            <div className="bg-[#09090b] rounded-lg p-2.5 border border-[#27272a] flex items-center justify-between font-mono text-xs">
              <span className="text-[#4ade80] truncate">{runnerCmd}</span>
              <button
                onClick={() => copyToClipboard(runnerCmd, setCopiedCmd)}
                className="p-1 rounded hover:bg-[#27272a] text-[#a1a1aa] hover:text-white shrink-0 ml-2"
                title="Copy execution command"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white text-black hover:bg-[#e4e4e7] text-xs font-semibold transition"
          >
            {isConnected ? 'Done & Return to Chat' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
