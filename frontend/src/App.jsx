import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import AuthModal from './components/AuthModal';
import RunnerModal from './components/RunnerModal';
import {
  fetchSessions,
  fetchSessionDetails,
  createSession,
  sendPrompt,
  deleteSession as apiDeleteSession,
  fetchRunnerStatus,
} from './api';

function getInitialUser() {
  const savedUser = localStorage.getItem('terminal_username');
  if (savedUser) {
    return { isGuest: false, username: savedUser, id: savedUser };
  }
  let guestId = localStorage.getItem('terminal_guest_id');
  if (!guestId) {
    guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('terminal_guest_id', guestId);
  }
  return { isGuest: true, username: 'Guest Mode', id: guestId };
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(getInitialUser);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isRunnerModalOpen, setIsRunnerModalOpen] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState({ connected: false, info: null });
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pollingRef = useRef(null);

  // Poll runner status for current user / guest every 3 seconds
  useEffect(() => {
    let interval = null;
    const checkRunner = async () => {
      if (currentUser?.id) {
        const res = await fetchRunnerStatus(currentUser.id);
        setRunnerStatus(res);
      }
    };
    checkRunner();
    interval = setInterval(checkRunner, 3000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // 1. Load tasks belonging to current user / guest
  const loadSessions = async (userId = currentUser.id) => {
    try {
      const data = await fetchSessions(userId);
      setSessions(data);
      return data;
    } catch (err) {
      console.error('Failed to load sessions:', err);
      return [];
    }
  };

  useEffect(() => {
    loadSessions(currentUser.id);
  }, [currentUser.id]);

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
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (!activeSessionId) return;

    const shouldPoll = activeSession?.status === 'running' || activeSession?.status === 'Pending' || activeSession?.status === 'awaiting_approval';

    if (shouldPoll) {
      pollingRef.current = setInterval(async () => {
        try {
          const updated = await fetchSessionDetails(activeSessionId);
          setActiveSession(updated);

          if (updated.status === 'completed' || updated.status === 'failed') {
            loadSessions(currentUser.id);
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
  }, [activeSessionId, activeSession?.status, currentUser.id]);

  // 4. Keyboard shortcut: Ctrl+K / Cmd+K
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
        // Create session tagged with current user / guest ID
        const newSession = await createSession(text, currentUser.id);
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setActiveSession(newSession);
      } else {
        const updated = await sendPrompt(activeSessionId, text);
        setActiveSession(prev => ({
          ...(updated || prev),
          status: 'running',
          steps: (updated?.steps && updated.steps.length > 0)
            ? updated.steps
            : [
                ...(prev?.steps || []),
                {
                  id: 'optimistic-' + Date.now(),
                  command: 'user_prompt',
                  output: text,
                  step_number: (prev?.steps?.length || 0) + 1,
                }
              ]
        }));
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Delete this task?')) return;
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
    await loadSessions(currentUser.id);
  };

  const handleAuthSuccess = (username) => {
    localStorage.setItem('terminal_username', username);
    setCurrentUser({ isGuest: false, username, id: username });
    handleNewChat();
  };

  const handleLogout = () => {
    localStorage.removeItem('terminal_username');
    const guestId = localStorage.getItem('terminal_guest_id') || `guest_${Math.random().toString(36).substring(2, 9)}`;
    setCurrentUser({ isGuest: true, username: 'Guest Mode', id: guestId });
    handleNewChat();
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
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
        runnerStatus={runnerStatus}
        onOpenRunnerModal={() => setIsRunnerModalOpen(true)}
      />

      <ChatArea
        activeSession={activeSession}
        onSendMessage={handleSendMessage}
        onRefresh={handleRefresh}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isLoading={isLoading}
        runnerStatus={runnerStatus}
        onOpenRunnerModal={() => setIsRunnerModalOpen(true)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        currentUserId={currentUser.id}
      />

      <RunnerModal
        isOpen={isRunnerModalOpen}
        onClose={() => setIsRunnerModalOpen(false)}
        userId={currentUser.id}
        runnerStatus={runnerStatus}
      />
    </div>
  );
}
