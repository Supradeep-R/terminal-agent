import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Menu, RefreshCw, Loader2, Bot, Terminal, Copy, Check } from 'lucide-react';
import TerminalCard from './TerminalCard';
import EmptyState from './EmptyState';

export default function ChatArea({
  activeSession,
  onSendMessage,
  onRefresh,
  onToggleSidebar,
  isLoading,
}) {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.steps, activeSession?.status, isLoading]);

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

  const isRunning = activeSession?.status === 'running' || activeSession?.status === 'Pending' || isLoading;

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
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeSession && (
            <div className="flex items-center gap-2 text-xs mr-2">
              <span className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-[#3b82f6] animate-pulse' : 'bg-[#10a37f]'
              }`} />
              <span className="text-[#a3a3a3] capitalize font-medium">
                {isRunning ? 'Running...' : activeSession.status || 'Ready'}
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
                  return (
                    <div key={step.id || idx} className="flex gap-3.5 my-4 px-2 sm:px-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#10a37f] to-[#3b82f6] flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 bg-[#1a1a1a] p-4 rounded-xl border border-[#333333] text-sm text-[#e5e5e5] leading-relaxed relative group">
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

                // 3. Terminal Execution Card
                return (
                  <div key={step.id || idx} className="flex gap-3.5 my-2 px-2 sm:px-0">
                    <div className="w-8 h-8 rounded-full bg-[#1b1b1b] border border-[#333333] flex items-center justify-center shrink-0 shadow-sm mt-1">
                      <Terminal className="w-4 h-4 text-[#60a5fa]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <TerminalCard step={step} />
                    </div>
                  </div>
                );
              })}

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
