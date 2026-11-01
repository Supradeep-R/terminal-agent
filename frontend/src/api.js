// API client for Terminal Agent backend

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function fetchSessions(userId) {
  const url = userId ? `${API_BASE}/api/sessions?user_id=${encodeURIComponent(userId)}` : `${API_BASE}/api/sessions`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchSessionDetails(sessionId) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch session details');
  return res.json();
}

export async function createSession(goal, userId) {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, user_id: userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create session');
  }
  return res.json();
}

export async function sendPrompt(sessionId, prompt) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to send prompt');
  }
  return res.json();
}

export async function deleteSession(sessionId) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete session');
  return res.json();
}

export async function loginOrRegister(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to authenticate');
  }
  return res.json();
}

export async function fetchRunnerStatus(userId) {
  try {
    const res = await fetch(`${API_BASE}/api/runner/status?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) return { connected: false };
    return res.json();
  } catch (e) {
    return { connected: false };
  }
}

export async function submitApproval(sessionId, decision, feedback = '') {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, feedback }),
  });
  if (!res.ok) throw new Error('Failed to submit approval');
  return res.json();
}
