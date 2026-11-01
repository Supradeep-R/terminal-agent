import React, { useState } from 'react';
import { Plus, Trash2, Search, Cpu, CheckCircle2, AlertCircle, Loader2, X, Terminal, User, LogIn, LogOut, ShieldCheck, Laptop } from 'lucide-react';

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  isOpen,
  onClose,
  currentUser,
  onOpenAuth,
  onLogout,
  runnerStatus,
  onOpenRunnerModal,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = sessions.filter(s => 
    s.goal.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs"
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed md:static inset-y-0 left-0 z-40
        w-72 bg-[#171717] border-r border-[#2a2a2a] flex flex-col justify-between
        transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Top Header */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 px-2 text-white font-semibold text-sm">
              <Terminal className="w-5 h-5 text-[#10a37f]" />
              <span>Terminal Agent</span>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#262626] text-[#9ca3af] hover:text-white md:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* New Chat Button */}
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onClose();
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#212121] hover:bg-[#2a2a2a] border border-[#333333] text-sm text-white font-medium transition group shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <Plus className="w-4 h-4 text-[#10a37f] group-hover:scale-110 transition" />
              <span>New task</span>
            </div>
            <span className="text-[11px] text-[#737373] border border-[#383838] px-1.5 py-0.5 rounded">
              Ctrl+K
            </span>
          </button>

          {/* Search bar if multiple sessions */}
          {sessions.length > 2 && (
            <div className="mt-3 relative">
              <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[#1e1e1e] border border-[#2e2e2e] rounded-lg text-xs text-white placeholder-[#737373] focus:outline-none focus:border-[#4f4f4f]"
              />
            </div>
          )}
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1 py-1">
          <div className="px-3 py-1 text-[11px] font-medium text-[#737373] uppercase tracking-wider flex items-center justify-between">
            <span>Your Tasks ({sessions.length})</span>
            {currentUser?.isGuest && (
              <span className="text-[10px] text-[#eab308] bg-[#eab308]/10 px-1.5 py-0.5 rounded">
                Guest Mode
              </span>
            )}
          </div>

          {filteredSessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[#737373]">
              {searchQuery ? 'No matching tasks found' : 'No tasks yet. Start a new one!'}
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isRunning = session.status === 'running' || session.status === 'Pending';
              const isFailed = session.status === 'failed';

              return (
                <div
                  key={session.id}
                  onClick={() => {
                    onSelectSession(session.id);
                    if (window.innerWidth < 768) onClose();
                  }}
                  className={`
                    group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition
                    ${isActive 
                      ? 'bg-[#2a2a2a] text-white font-medium border border-[#383838]' 
                      : 'text-[#a3a3a3] hover:bg-[#212121] hover:text-white border border-transparent'}
                  `}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#3b82f6] animate-spin shrink-0" />
                    ) : isFailed ? (
                      <AlertCircle className="w-3.5 h-3.5 text-[#ef4444] shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#10a37f] shrink-0" />
                    )}

                    <span className="truncate">
                      {session.goal || 'Untitled Session'}
                    </span>
                  </div>

                  {/* Delete button (reveals on hover) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    title="Delete session"
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#383838] text-[#9ca3af] hover:text-[#ef4444] transition shrink-0 ml-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: User Account Status & Model Status */}
        <div className="p-3 border-t border-[#2a2a2a] bg-[#141414] space-y-2">
          {/* User Account / Guest Switcher */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] text-xs">
            <div className="flex items-center gap-2 truncate">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                currentUser?.isGuest ? 'bg-[#333333] text-[#a3a3a3]' : 'bg-[#10a37f]/20 text-[#10a37f]'
              }`}>
                {currentUser?.isGuest ? <User className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              </div>
              <div className="truncate text-white font-medium text-[11px]">
                {currentUser?.username || 'Guest'}
              </div>
            </div>

            {currentUser?.isGuest ? (
              <button
                onClick={onOpenAuth}
                className="text-[11px] text-[#10a37f] hover:underline flex items-center gap-1 font-medium ml-2 shrink-0"
              >
                <LogIn className="w-3 h-3" />
                <span>Sign In</span>
              </button>
            ) : (
              <button
                onClick={onLogout}
                title="Log out"
                className="text-[11px] text-[#ef4444] hover:text-[#f87171] p-1 rounded hover:bg-[#2b2b2b] transition shrink-0 ml-2"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Local Runner Status Card */}
          <div 
            onClick={onOpenRunnerModal}
            className="bg-[#1c1c1c] p-2 rounded-xl border border-[#2a2a2a] cursor-pointer hover:border-[#3f3f46] transition"
          >
            <div className="flex items-center justify-between text-[11px] text-white font-medium mb-1">
              <div className="flex items-center gap-1.5">
                <Laptop className="w-3 h-3 text-[#60a5fa]" />
                <span>Execution Target</span>
              </div>
              <span className={`w-1.5 h-1.5 rounded-full ${
                runnerStatus?.connected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#71717a]'
              }`} />
            </div>

            <div className="flex justify-between items-center text-[10px]">
              <span className={runnerStatus?.connected ? 'text-[#4ade80] font-mono' : 'text-[#737373]'}>
                {runnerStatus?.connected ? 'Local Machine' : 'Cloud Sandbox'}
              </span>
              <span className="text-[#60a5fa] hover:underline">
                {runnerStatus?.connected ? 'Settings' : 'Connect'}
              </span>
            </div>
          </div>

          {/* Model indicator */}
          <div className="bg-[#1c1c1c] p-2 rounded-xl border border-[#2a2a2a]">
            <div className="flex items-center justify-between text-[11px] text-white font-medium mb-1">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-[#10a37f]" />
                <span>Router Status</span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            </div>

            <div className="flex justify-between items-center text-[10px] text-[#737373]">
              <span>Primary: <span className="text-[#60a5fa] font-mono">Gemini 3.6</span></span>
              <span>Fallback: <span className="text-[#c084fc] font-mono">Groq 27B</span></span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
