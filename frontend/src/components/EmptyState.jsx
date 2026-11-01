import React from 'react';
import { Terminal, FolderGit2, FileCode, CheckCircle2, Cpu } from 'lucide-react';

const SUGGESTIONS = [
  {
    title: 'Explore Workspace',
    desc: 'List all files and summarize the repository structure',
    prompt: 'Check what files are in the current directory and write a short summary of the repository structure.',
    icon: Terminal,
  },
  {
    title: 'Create Python Script',
    desc: 'Write and test a Fibonacci calculation module',
    prompt: 'Create a Python script named fibonacci.py that calculates the first 10 Fibonacci numbers and run it to verify.',
    icon: FileCode,
  },
  {
    title: 'Git Health Check',
    desc: 'Inspect git status, branches, and recent commits',
    prompt: 'Run git status and show the recent commits on this branch.',
    icon: FolderGit2,
  },
  {
    title: 'Inspect Dependencies',
    desc: 'Analyze requirements.txt and verify Python version',
    prompt: 'Inspect requirements.txt, check installed python packages, and report any missing modules.',
    icon: Cpu,
  },
];

export default function EmptyState({ onSelectPrompt }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto">
      {/* ChatGPT-style Sparkle / Terminal Icon */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#10a37f] to-[#3b82f6] flex items-center justify-center shadow-xl shadow-[#10a37f]/20 mb-5">
        <Terminal className="w-9 h-9 text-white" />
      </div>

      <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">
        What can I run for you today?
      </h1>
      <p className="text-sm text-[#9ca3af] max-w-md mb-8">
        Terminal Agent executes shell commands, inspects outputs, and solves tasks autonomously with resilient multi-model fallbacks.
      </p>

      {/* Suggestion Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        {SUGGESTIONS.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={index}
              onClick={() => onSelectPrompt(item.prompt)}
              className="text-left p-4 rounded-xl border border-[#383838] bg-[#1a1a1a] hover:bg-[#262626] hover:border-[#4f4f4f] transition flex flex-col justify-between group shadow-sm"
            >
              <div className="flex items-center gap-2 mb-1.5 text-white font-medium text-sm">
                <Icon className="w-4 h-4 text-[#10a37f] group-hover:text-[#60a5fa] transition" />
                <span>{item.title}</span>
              </div>
              <p className="text-xs text-[#a3a3a3] leading-relaxed">
                {item.desc}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
