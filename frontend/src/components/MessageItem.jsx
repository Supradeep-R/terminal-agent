import React, { useState } from 'react';
import { User, Bot, Copy, Check } from 'lucide-react';
import TerminalCard from './TerminalCard';

export default function MessageItem({ item }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. User Message
  if (item.type === 'user') {
    return (
      <div className="flex justify-end my-4 px-2 sm:px-0">
        <div className="max-w-[85%] sm:max-w-xl bg-[#2f2f2f] text-white px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed shadow-sm border border-[#3d3d3d]">
          {item.content}
        </div>
      </div>
    );
  }

  // 2. Assistant Turn (with terminal steps + final response)
  const terminalSteps = item.steps ? item.steps.filter(s => s.command !== 'response') : [];
  const responseStep = item.steps ? item.steps.find(s => s.command === 'response') : null;

  return (
    <div className="flex gap-3.5 my-5 px-2 sm:px-0">
      {/* Bot Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#10a37f] to-[#3b82f6] flex items-center justify-center shrink-0 shadow-sm mt-0.5">
        <Bot className="w-4 h-4 text-white" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Terminal execution steps */}
        {terminalSteps.length > 0 && (
          <div className="mb-3">
            {terminalSteps.map((step) => (
              <TerminalCard key={step.id || step.step_number} step={step} />
            ))}
          </div>
        )}

        {/* Textual Final Response if available */}
        {responseStep && responseStep.output && (
          <div className="bg-[#1f1f1f] p-4 rounded-xl border border-[#333333] text-sm text-[#e5e5e5] leading-relaxed relative group">
            <div className="whitespace-pre-wrap font-sans">
              {responseStep.output}
            </div>

            <button
              onClick={() => handleCopy(responseStep.output)}
              title="Copy response"
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-[#2b2b2b] hover:bg-[#383838] text-[#9ca3af] hover:text-white transition opacity-0 group-hover:opacity-100"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
