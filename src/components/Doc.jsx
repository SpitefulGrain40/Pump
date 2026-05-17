import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Heart, AlertCircle, X, Settings, ChevronDown, LogOut } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useSettings } from '../hooks/useSettings';
import { sendToAnthropic } from '../services/ai/providers';
import { format } from 'date-fns';

const INACTIVITY_MS = 30 * 60 * 1000;

const DEFAULT_SYSTEM_PROMPT = `You are Doc, a warm and empathetic AI therapy companion. You provide a safe, non-judgmental space for reflection, emotional support, and personal insight.

Your approach:
- Listen deeply and reflect back what you hear before offering any perspective
- Ask open, curious questions that invite the user to explore their own thoughts and feelings
- Avoid giving direct advice unless explicitly asked — your role is to help the user find their own answers
- Acknowledge emotions fully before moving to problem-solving
- Notice patterns across conversations and gently reflect them when helpful
- Hold complexity — people are contradictory, and that is okay
- Be warm but not saccharine; honest but not blunt
- Keep responses concise — therapy is mostly listening, not talking

Important boundaries:
- You are an AI, not a licensed therapist. If someone is in crisis or at risk, always encourage them to seek professional help and provide the Samaritans number (116 123) or relevant emergency services
- Never diagnose or prescribe
- Never share or reference anything from the fitness Coach context — this is a completely separate space

Begin each new session by briefly acknowledging any themes from previous sessions (if memory exists), then asking how the user is today.`;

export default function Doc() {
  const [messages, setMessages] = useLocalStorage('pump-doc-chat', []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [systemPrompt, setSystemPrompt] = useLocalStorage('pump-doc-system-prompt', DEFAULT_SYSTEM_PROMPT);
  const [promptDraft, setPromptDraft] = useState('');
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  // Two-tier memory
  const [longTermSummary, setLongTermSummary] = useLocalStorage('pump-doc-longterm', '');
  const [recentSessions, setRecentSessions] = useLocalStorage('pump-doc-sessions', []);

  const { aiSettings, isConfigured } = useSettings();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const inactivityTimer = useRef(null);
  const sessionMessageCount = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark session as started when first message sent
  useEffect(() => {
    if (messages.length > 0) setSessionStarted(true);
  }, [messages]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (sessionStarted && messages.length > 0) {
      inactivityTimer.current = setTimeout(() => {
        triggerEndSession('inactivity');
      }, INACTIVITY_MS);
    }
  }, [sessionStarted, messages.length]);

  useEffect(() => {
    resetInactivityTimer();
    return () => { if (inactivityTimer.current) clearTimeout(inactivityTimer.current); };
  }, [resetInactivityTimer]);

  const getApiKey = () => {
    if (aiSettings.provider === 'anthropic') return aiSettings.anthropicKey;
    return aiSettings.anthropicKey; // Doc always uses Anthropic
  };

  const buildContextualSystemPrompt = () => {
    let fullPrompt = systemPrompt;

    if (longTermSummary) {
      fullPrompt += `\n\n## LONG-TERM MEMORY\nThe following is a summary of themes, patterns, and important disclosures from all previous sessions:\n\n${longTermSummary}`;
    }

    if (recentSessions.length > 0) {
      const recent = recentSessions.slice(-3);
      fullPrompt += `\n\n## RECENT SESSIONS\n`;
      recent.forEach((session, i) => {
        fullPrompt += `\n### Session ${recent.length - i} (${session.date})\n${session.summary}`;
      });
    }

    return fullPrompt;
  };

  const triggerEndSession = async (reason = 'manual') => {
    if (messages.length === 0) return;
    if (isEndingSession) return;

    const currentMessages = messages;
    setIsEndingSession(true);

    const apiKey = getApiKey();
    if (!apiKey) {
      setIsEndingSession(false);
      return;
    }

    try {
      const transcript = currentMessages
        .map(m => `${m.role === 'user' ? 'User' : 'Doc'}: ${m.content}`)
        .join('\n\n');

      // Tier 2: session summary
      const sessionSummaryPrompt = `Below is a therapy session transcript. Write a concise summary (150-200 words) capturing:
- The main topics and emotions explored
- Any significant disclosures or realisations
- The emotional arc of the session
- Any unresolved threads worth returning to

Write in third person (e.g. "The user discussed..."). Be clinical but warm.

TRANSCRIPT:
${transcript}`;

      const [sessionResult, longTermResult] = await Promise.all([
        sendToAnthropic(apiKey, 'claude-opus-4-5', [{ role: 'user', content: sessionSummaryPrompt }], null),
        (async () => {
          const updatePrompt = longTermSummary
            ? `You are maintaining a long-term therapeutic memory document. Below is the existing summary, followed by a new session transcript. Merge the new insights into the existing summary, keeping the document concise (300-400 words max). Update, deepen, or add to existing themes — do not simply append. Return only the updated summary document.

EXISTING SUMMARY:
${longTermSummary}

NEW SESSION TRANSCRIPT:
${transcript}`
            : `Below is a therapy session transcript. Write a long-term memory document (200-300 words) capturing the key themes, emotional patterns, important disclosures, and anything worth tracking across future sessions. Write in third person.

TRANSCRIPT:
${transcript}`;

          return sendToAnthropic(apiKey, 'claude-opus-4-5', [{ role: 'user', content: updatePrompt }], null);
        })(),
      ]);

      // Store Tier 2 session
      const newSession = {
        id: `doc-session-${Date.now()}`,
        date: format(new Date(), 'yyyy-MM-dd'),
        summary: sessionResult.content,
        messageCount: currentMessages.length,
      };

      setRecentSessions(prev => {
        const updated = [...prev, newSession];
        // Keep last 10 sessions stored, only last 3 injected into context
        return updated.slice(-10);
      });

      // Update Tier 1 long-term summary
      setLongTermSummary(longTermResult.content);

      // Clear current session chat
      setMessages([]);
      setSessionStarted(false);
      sessionMessageCount.current = 0;

      if (reason === 'manual') {
        // Show a brief closing message
        setMessages([{
          role: 'assistant',
          content: "Session saved. Take care of yourself. When you're ready to talk again, I'll be here.",
          timestamp: Date.now(),
          isClosing: true,
        }]);
      }
    } catch (e) {
      console.error('Session end failed:', e);
      setError('Failed to save session. Your conversation is still here.');
    } finally {
      setIsEndingSession(false);
    }
  };

  const handleSend = async (messageText = input) => {
    if (!messageText.trim() || isLoading) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      setError('No Anthropic API key configured. Please add one in Settings.');
      return;
    }

    resetInactivityTimer();

    const userMessage = { role: 'user', content: messageText.trim(), timestamp: Date.now() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setError(null);
    setIsLoading(true);
    setSessionStarted(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      const contextualPrompt = buildContextualSystemPrompt();
      const chatMessages = updatedMessages
        .filter(m => !m.isClosing)
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await sendToAnthropic(apiKey, 'claude-opus-4-5', chatMessages, contextualPrompt);

      const assistantMessage = { role: 'assistant', content: response.content, timestamp: Date.now() };
      setMessages([...updatedMessages, assistantMessage]);
    } catch (err) {
      setError(err.message || 'Failed to connect to Doc');
    } finally {
      setIsLoading(false);
    }
  };

  const formatMessage = (content) => {
    return content.split('\n').map((line, i) => (
      <div key={i}>{line || <br />}</div>
    ));
  };

  const hasActiveSession = messages.filter(m => !m.isClosing).length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart size={20} className="text-accent" />
            <h1 className="text-lg font-semibold">Doc</h1>
          </div>
          <div className="flex items-center gap-1">
            {hasActiveSession && (
              <button
                onClick={() => triggerEndSession('manual')}
                disabled={isEndingSession}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface text-text-muted hover:text-text disabled:opacity-50"
                title="End session and save"
              >
                {isEndingSession ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                End session
              </button>
            )}
            <button
              onClick={() => { setPromptDraft(systemPrompt); setShowPromptEditor(true); }}
              className="p-2 rounded-lg text-text-muted hover:text-text"
              title="Edit therapist persona"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
        <p className="text-xs text-text-muted mt-1">
          {isEndingSession ? 'Saving session…' : 'Your private space for reflection'}
        </p>
        {(longTermSummary || recentSessions.length > 0) && (
          <div className="mt-1 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-xs text-text-muted">
              {recentSessions.length} previous session{recentSessions.length !== 1 ? 's' : ''} in memory
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="text-center text-text-muted py-12">
            <Heart size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium text-text">This is your space.</p>
            <p className="text-sm mt-1 opacity-70">Say whatever is on your mind.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-accent text-bg rounded-br-sm'
                : msg.isClosing
                  ? 'bg-surface/50 text-text-muted rounded-bl-sm italic'
                  : 'bg-surface rounded-bl-sm'
            }`}>
              <div className="whitespace-pre-wrap leading-relaxed">
                {formatMessage(msg.content)}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-surface rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 size={18} className="animate-spin text-accent" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-danger/20 text-danger p-3 rounded-lg text-sm">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="What's on your mind?"
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-accent resize-none overflow-hidden text-sm"
            disabled={isLoading || isEndingSession}
            rows={1}
            style={{ minHeight: '48px', maxHeight: '150px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading || isEndingSession}
            className="bg-accent text-bg p-3 rounded-xl disabled:opacity-50 shrink-0"
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* System prompt editor */}
      {showPromptEditor && (
        <div className="fixed inset-0 z-[60] bg-black/60" onClick={() => setShowPromptEditor(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-2xl flex flex-col"
            style={{ maxHeight: '85dvh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 pb-2 shrink-0">
              <h2 className="font-semibold">Therapist Persona</h2>
              <button onClick={() => setShowPromptEditor(false)} className="p-1 text-text-muted">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-text-muted px-4 pb-3 shrink-0">
              This defines how Doc approaches conversations. Changes take effect from the next message.
            </p>
            <div className="mx-4 overflow-hidden" style={{ height: '40dvh' }}>
              <textarea
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                className="w-full h-full bg-bg border border-border rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-accent font-mono overflow-y-auto"
              />
            </div>
            <div className="flex gap-2 p-4 shrink-0 border-t border-border">
              <button
                onClick={() => { setPromptDraft(DEFAULT_SYSTEM_PROMPT); }}
                className="flex-1 py-2 rounded-xl bg-bg text-text-muted text-sm border border-border"
              >
                Reset to default
              </button>
              <button
                onClick={() => { setSystemPrompt(promptDraft); setShowPromptEditor(false); }}
                className="flex-1 py-2 rounded-xl bg-accent text-bg text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
