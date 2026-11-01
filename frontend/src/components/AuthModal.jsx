import React, { useState } from 'react';
import { X, Lock, User, Check, AlertCircle, Loader2 } from 'lucide-react';
import { loginOrRegister } from '../api';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, currentUserId }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please provide both username and password');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      const res = await loginOrRegister(username.trim(), password.trim());
      onAuthSuccess(res.username);
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-[#1c1c1c] border border-[#383838] rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#8e8e8e] hover:text-white hover:bg-[#2b2b2b] transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-[#10a37f]/20 flex items-center justify-center text-[#10a37f]">
            <Lock className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-semibold text-white tracking-tight">
            Account / Save Work
          </h2>
        </div>

        <p className="text-xs text-[#a3a3a3] mb-5 leading-relaxed">
          Enter a unique username and password. If the username doesn't exist yet, it will be automatically registered for you!
        </p>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#f87171] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-medium text-[#b4b4b4] uppercase mb-1">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. dev_user"
                className="w-full bg-[#141414] border border-[#2e2e2e] focus:border-[#10a37f] rounded-xl px-9 py-2 text-sm text-white placeholder-[#555] focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#b4b4b4] uppercase mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#141414] border border-[#2e2e2e] focus:border-[#10a37f] rounded-xl px-9 py-2 text-sm text-white placeholder-[#555] focus:outline-none transition"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-[#10a37f] hover:bg-[#0e8e6e] text-white text-xs font-semibold shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Sign In / Register</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 px-4 rounded-xl hover:bg-[#282828] text-xs text-[#8e8e8e] hover:text-white transition"
            >
              Stay in Guest Mode
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
