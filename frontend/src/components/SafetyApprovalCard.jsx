import React, { useState } from 'react';
import { ShieldAlert, CheckCircle, XCircle, AlertTriangle, Terminal, Loader2 } from 'lucide-react';

export default function SafetyApprovalCard({ session, onApprove, onReject, isSubmitting }) {
  const [feedback, setFeedback] = useState('');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  if (!session || session.status !== 'awaiting_approval') return null;

  return (
    <div className="my-4 rounded-2xl border-2 border-[#b45309] bg-gradient-to-b from-[#2e1065]/60 via-[#1c1917]/90 to-[#18181b] p-5 shadow-2xl space-y-4 animate-in fade-in duration-200 font-sans">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#78350f]/60 border border-[#b45309] flex items-center justify-center shrink-0 shadow-inner">
            <ShieldAlert className="w-5 h-5 text-[#f59e0b] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Human-in-the-Loop Security Guardrail Triggered
              </h3>
              <span className="text-[10px] bg-[#78350f] text-[#fef08a] px-2 py-0.5 rounded-full font-mono font-semibold border border-[#ca8a04]/40">
                Action Intercepted
              </span>
            </div>
            <p className="text-xs text-[#a1a1aa] mt-0.5">
              The agent attempted a destructive shell command. Execution is paused pending your review.
            </p>
          </div>
        </div>
      </div>

      {/* Risk Reason Badge */}
      {session.pending_risk && (
        <div className="flex items-center gap-2 text-xs bg-[#451a03]/80 border border-[#b45309]/60 px-3 py-2 rounded-xl text-[#fde047]">
          <AlertTriangle className="w-4 h-4 text-[#fbbf24] shrink-0" />
          <span><strong>Security Policy Flag:</strong> {session.pending_risk}</span>
        </div>
      )}

      {/* Intercepted Command Box */}
      <div className="space-y-1">
        <div className="text-[11px] text-[#a1a1aa] font-medium flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-[#f87171]" />
          <span>Intercepted Shell Command:</span>
        </div>
        <div className="bg-[#0c0a09] border border-[#dc2626]/40 p-3 rounded-xl font-mono text-xs text-red-400 font-semibold select-text break-all">
          <span className="text-[#a8a29e] mr-2">$</span>
          {session.pending_command}
        </div>
      </div>

      {/* Agent Reasoning */}
      {session.pending_thought && (
        <div className="text-xs text-[#d4d4d8] bg-[#1c1917]/70 p-3 rounded-xl border border-[#2e2e38] space-y-1">
          <span className="font-semibold text-[#c084fc] block">Agent's Stated Reason:</span>
          <p className="leading-relaxed text-[#a1a1aa] text-[11px] font-sans">
            "{session.pending_thought}"
          </p>
        </div>
      )}

      {/* Optional rejection feedback input */}
      {showFeedbackInput && (
        <div className="space-y-1">
          <label className="text-[11px] text-[#a1a1aa] block font-medium">
            Instruction / Reason for Rejection (Optional):
          </label>
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. 'Do not delete the folder, create a backup instead'..."
            className="w-full text-xs bg-[#0c0a09] border border-[#3f3f46] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#60a5fa]"
          />
        </div>
      )}

      {/* Decision Buttons */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#292524]">
        <button
          onClick={() => setShowFeedbackInput(!showFeedbackInput)}
          className="text-[11px] text-[#9ca3af] hover:text-white underline"
        >
          {showFeedbackInput ? 'Hide guidance input' : '+ Add custom guidance for rejection'}
        </button>

        <div className="flex items-center gap-2">
          {/* Reject button */}
          <button
            onClick={() => onReject(feedback)}
            disabled={isSubmitting}
            className="px-3.5 py-2 rounded-xl bg-[#7f1d1d]/80 hover:bg-[#991b1b] border border-[#ef4444]/40 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5 text-red-300" />}
            <span>Reject & Ask to Re-plan</span>
          </button>

          {/* Approve button */}
          <button
            onClick={onApprove}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#15803d] to-[#16a34a] hover:from-[#16a34a] hover:to-[#22c55e] border border-[#22c55e]/50 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-green-900/40 transition disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 text-white" />}
            <span>Approve & Execute</span>
          </button>
        </div>
      </div>
    </div>
  );
}
