import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import {
  fetchSessions,
  fetchSessionDetails,
  createSession,
  sendPrompt,
  deleteSession as apiDeleteSession,
} from './api';

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pollingRef = useRef(null);

  // 1. Initial load of all past sessions
  const loadSessions = async () => {
    try {
      const data = await fetchSessions();
      setSessions(data);
      return data;
    } catch (err) {
      console.error('Failed to load sessions:', err);
      return [];
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // 2. Fetch active session details
  const loadSessionDetails = async (sessionId) => {
    try {
      const data = await fetchSessionDetails(sessionId);
      setActiveSession(data);
      return data;
    } catch (err) {
      console.error('Failed to load session details:', err);
    }
  };

  useEffect(() => {
    if (activeSessionId) {
      loadSessionDetails(activeSessionId);
    } else {
      setActiveSession(null);
    }
  }, [activeSessionId]);

  // 3. Auto-polling loop for active running session
  useEffect(() => {
    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (!activeSessionId) return;

    const isRunning = activeSession?.status === 'running' || activeSession?.status === 'Pending';

    if (isRunning) {
      pollingRef.current = setInterval(async () => {
        try {
          const updated = await fetchSessionDetails(activeSessionId);
          setActiveSession(updated);

          // If finished running, refresh sidebar sessions list
          if (updated.status === 'completed' || updated.status === 'failed') {
            loadSessions();
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 1500);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeSessionId, activeSession?.status]);

  // 4. Keyboard shortcut: Ctrl+K or Cmd+K for New Chat
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 5. Actions
  const handleNewChat = () => {
    setActiveSessionId(null);
    setActiveSession(null);
  };

  const handleSelectSession = (sessionId) => {
    setActiveSessionId(sessionId);
  };

  const handleSendMessage = async (text) => {
    setIsLoading(true);
    try {
      if (!activeSessionId) {
        // Start a brand-new session
        const newSession = await createSession(text);
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setActiveSession(newSession);
      } else {
        // Send follow-up prompt in current session
        const updated = await sendPrompt(activeSessionId, text);
        setActiveSession(prev => ({
          ...prev,
          status: 'running',
        }));
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this session?')) return;
    try {
      await apiDeleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      alert(`Error deleting session: ${err.message}`);
    }
  };

  const handleRefresh = async () => {
    if (activeSessionId) {
      await loadSessionDetails(activeSessionId);
    }
    await loadSessions();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#212121]">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <ChatArea
        activeSession={activeSession}
        onSendMessage={handleSendMessage}
        onRefresh={handleRefresh}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isLoading={isLoading}
      />
    </div>
  );
}
