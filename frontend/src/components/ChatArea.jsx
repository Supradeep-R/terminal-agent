import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Menu, RefreshCw, Loader2, Bot, Terminal, Copy, Check, Zap, AlertTriangle, Brain, Laptop, FileCode, ShieldAlert } from 'lucide-react';
import TerminalCard from './TerminalCard';
import DiffViewerCard from './DiffViewerCard';
import SafetyApprovalCard from './SafetyApprovalCard';
import EmptyState from './EmptyState';
import { submitApproval } from '../api';

export default function ChatArea({
  activeSession,
  onSendMessage,
  onRefresh,
  onToggleSidebar,
  isLoading,
  runnerStatus,
  onOpenRunnerModal,
}) {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.steps, activeSession?.status, isLoading]);

  const handleApprove = async () => {
    if (!activeSession?.id) return;
    setIsApproving(true);
    try {
      await submitApproval(activeSession.id, 'approve');
      onRefresh();
    } catch (err) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async (feedback) => {
    if (!activeSession?.id) return;
    setIsApproving(true);
    try {
      await submitApproval(activeSession.id, 'reject', feedback);
      onRefresh();
    } catch (err) {
      alert(`Rejection error: ${err.message}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!inputText.trim() || isRunning) return;
    onSendMessage(inputText.trim());
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isWaitingApproval = activeSession?.status === 'awaiting_approval';
  const isRunning = (activeSession?.status === 'running' || activeSession?.status === 'Pending' || isLoading) && !isWaitingApproval;

  return (
    <main className="flex-1 flex flex-col h-screen bg-[#212121] overflow-hidden">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-[#2e2e2e] flex items-center justify-between px-4 bg-[#212121]/90 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-lg hover:bg-[#2e2e2e] text-[#a3a3a3] hover:text-white transition md:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-sm">Terminal Agent</span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#10a37f]/20 text-[#10a37f] border border-[#10a37f]/30">
              v1.0
            </span>
            {/* Execution Target Environment Badge */}
            <button
              onClick={onOpenRunnerModal}
              title="Click to manage execution environment (Local Machine vs. Cloud Sandbox)"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition cursor-pointer ml-1 ${
                runnerStatus?.connected
                  ? 'bg-[#14532d]/40 border-[#22c55e]/40 text-[#4ade80] hover:bg-[#14532d]/60'
                  : 'bg-[#27272a]/60 border-[#3f3f46] text-[#9ca3af] hover:text-white hover:bg-[#27272a]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${
                runnerStatus?.connected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#71717a]'
              }`} />
              <Laptop className="w-3 h-3 text-[#60a5fa]" />
              <span className="hidden sm:inline">
                {runnerStatus?.connected ? 'Local Machine Active' : 'Cloud Sandbox'}
              </span>
              {!runnerStatus?.connected && (
                <span className="text-[10px] text-[#60a5fa] hover:underline ml-0.5 font-semibold">
                  Connect Local
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeSession && (
            <div className="flex items-center gap-2 text-xs mr-2">
              <span className={`w-2 h-2 rounded-full ${
                isWaitingApproval
                  ? 'bg-[#f59e0b] animate-ping'
                  : isRunning
                  ? 'bg-[#3b82f6] animate-pulse'
                  : 'bg-[#10a37f]'
              }`} />
              <span className={`capitalize font-medium ${isWaitingApproval ? 'text-[#facc15] font-bold flex items-center gap-1' : 'text-[#a3a3a3]'}`}>
                {isWaitingApproval && <ShieldAlert className="w-3.5 h-3.5 text-[#f59e0b]" />}
                {isWaitingApproval ? 'Needs Approval' : isRunning ? 'Running...' : activeSession.status || 'Ready'}
              </span>
            </div>
          )}

          <button
            onClick={onRefresh}
            title="Refresh session"
            className="p-2 rounded-lg hover:bg-[#2e2e2e] text-[#a3a3a3] hover:text-white transition"
          >
            <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin text-[#3b82f6]' : ''}`} />
          </button>
        </div>
      </header>

      {/* Message Feed Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 md:px-8">
        <div className="max-w-3xl mx-auto min-h-full flex flex-col justify-between">
          {!activeSession ? (
            <EmptyState onSelectPrompt={(prompt) => onSendMessage(prompt)} />
          ) : (
            <div className="flex-1 space-y-4">
              {/* Turn 1 Initial User Goal */}
              <div className="flex justify-end my-3 px-2 sm:px-0">
                <div className="max-w-[85%] sm:max-w-xl bg-[#2f2f2f] text-white px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed shadow-sm border border-[#3d3d3d]">
                  {activeSession.goal}
                </div>
              </div>

              {/* Steps and Responses */}
              {activeSession.steps && activeSession.steps.map((step, idx) => {
                // 1. Follow-up User Message
                if (step.command === 'user_prompt') {
                  return (
                    <div key={step.id || idx} className="flex justify-end my-3 px-2 sm:px-0">
                      <div className="max-w-[85%] sm:max-w-xl bg-[#2f2f2f] text-white px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed shadow-sm border border-[#3d3d3d]">
                        {step.output}
                      </div>
                    </div>
                  );
                }

                // 2. Final AI Text Response
                if (step.command === 'response') {
                  let parsedTrace = [];
                  try {
                    if (step.routing_trace) {
                      parsedTrace = typeof step.routing_trace === 'string' ? JSON.parse(step.routing_trace) : step.routing_trace;
                    }
                  } catch (e) {
                    parsedTrace = [];
                  }
                  const failedAttempt = Array.isArray(parsedTrace) ? parsedTrace.find(t => t.status === 'failed') : null;

                  return (
                    <div key={step.id || idx} className="flex gap-3.5 my-4 px-2 sm:px-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#10a37f] to-[#3b82f6] flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 bg-[#1a1a1a] p-4 rounded-xl border border-[#333333] text-sm text-[#e5e5e5] leading-relaxed relative group space-y-2.5">
                        {/* Fallback Notice if triggered */}
                        {failedAttempt && (
                          <div className="rounded-lg bg-[#451a03]/80 border border-[#b45309]/50 p-2.5 text-xs text-[#fed7aa] flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
                            <div className="text-[11px] leading-relaxed">
                              <span className="font-semibold text-white">⚡ Fallback Router: </span>
                              Primary model <span className="underline">{failedAttempt.provider}</span> {failedAttempt.is_rate_limit ? 'hit API rate limit (429)' : 'failed'}, switched automatically to <span className="underline font-semibold text-emerald-300">{step.model_name}</span>.
                            </div>
                          </div>
                        )}

                        {/* Model Badge */}
                        {step.model_name && (
                          <div className="flex items-center gap-1.5 text-[11px] text-[#9ca3af] font-mono pb-1 border-b border-[#2b2b2b]">
                            <Zap className="w-3 h-3 text-[#38bdf8]" />
                            <span>Response synthesized by: <strong className="text-white">{step.model_name}</strong></span>
                          </div>
                        )}

                        <div className="whitespace-pre-wrap font-sans">
                          {step.output}
                        </div>
                        <button
                          onClick={() => handleCopyText(step.output, step.id || idx)}
                          title="Copy response"
                          className="absolute top-3 right-3 p-1.5 rounded-lg bg-[#2b2b2b] hover:bg-[#383838] text-[#9ca3af] hover:text-white transition opacity-0 group-hover:opacity-100"
                        >
                          {copiedId === (step.id || idx) ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                }

                // 3. Diff Patch Card vs Terminal Execution Card
                const isEditFile = step.command && step.command.startsWith('edit_file');
                return (
                  <div key={step.id || idx} className="flex gap-3.5 my-2 px-2 sm:px-0">
                    <div className="w-8 h-8 rounded-full bg-[#1b1b1b] border border-[#333333] flex items-center justify-center shrink-0 shadow-sm mt-1">
                      {isEditFile ? (
                        <FileCode className="w-4 h-4 text-[#38bdf8]" />
                      ) : (
                        <Terminal className="w-4 h-4 text-[#60a5fa]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditFile ? (
                        <DiffViewerCard step={step} />
                      ) : (
                        <TerminalCard step={step} />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Human-in-the-Loop Security Approval Card */}
              {isWaitingApproval && (
                <SafetyApprovalCard
                  session={activeSession}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isSubmitting={isApproving}
                />
              )}

              {/* Live Running Indicator */}
              {isRunning && (
                <div className="flex items-center gap-3 py-3 px-2 text-[#9ca3af] text-sm animate-pulse font-mono">
                  <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center shrink-0 border border-[#3d3d3d]">
                    <Loader2 className="w-4 h-4 text-[#3b82f6] animate-spin" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#10a37f]" />
                    <span>Executing commands & analyzing output...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Input Bar */}
      <div className="p-4 sm:p-6 bg-gradient-to-t from-[#212121] via-[#212121] to-transparent shrink-0">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center rounded-3xl bg-[#2f2f2f] border border-[#3e3e3e] shadow-2xl focus-within:border-[#525252] transition px-4 py-2"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                activeSession
                  ? 'Send a follow-up instruction (e.g. "Now delete the temp file")...'
                  : 'Ask Terminal Agent to run commands or solve a task...'
              }
              className="w-full bg-transparent text-white text-sm placeholder-[#8e8e8e] resize-none focus:outline-none max-h-40 py-2 pr-10 leading-relaxed font-sans"
            />

            <button
              type="submit"
              disabled={!inputText.trim() || isRunning}
              className={`
                absolute right-2.5 p-2 rounded-full transition shrink-0
                ${inputText.trim() && !isRunning
                  ? 'bg-white text-black hover:bg-[#e5e5e5] shadow-md' 
                  : 'bg-[#404040] text-[#737373] cursor-not-allowed'}
              `}
            >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </button>
          </form>

          <p className="text-center text-[11px] text-[#737373] mt-2">
            Terminal Agent autonomously executes shell commands. Review actions for safety.
          </p>
        </div>
      </div>
    </main>
  );
}
