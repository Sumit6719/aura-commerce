import { useState, useRef, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import ReactMarkdown from 'react-markdown';
import { voiceService } from './utils/voiceService';
import PaymentTracker from './components/PaymentTracker';

function normalizeMessageContent(content) {
  if (typeof content === 'string') return content;
  if (content == null) return "";
  if (typeof content === 'object') {
    // The merchant agent returns { responseText, paymentLink }
    return content.responseText ?? content.text ?? content.reply ?? "";
  }
  return String(content);
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId] = useState(() => 'sess_' + Math.random().toString(36).substr(2, 9));
  const [isLoading, setIsLoading] = useState(false);
  const [buyerMode, setBuyerMode] = useState('human');
  const [voiceState, setVoiceState] = useState('IDLE'); // IDLE, LISTENING, PROCESSING, SPEAKING

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messagesInnerRef = useRef(null);
  const inputRef = useRef(null);
  const isUserScrolledUp = useRef(false);

  const [showDashboard, setShowDashboard] = useState(false);
  const [showExplanationFor, setShowExplanationFor] = useState(null);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Consider the user intentionally scrolled up if they are > 150px from bottom
    isUserScrolledUp.current = scrollHeight - scrollTop - clientHeight > 150;
  };

  const scrollToBottom = (force = false, behavior = 'smooth') => {
    if (!messagesContainerRef.current) return;

    if (force || !isUserScrolledUp.current) {
      if (behavior === 'auto') {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  };

  useEffect(() => {
    // When messages array changes, scroll instantly to avoid jumping
    scrollToBottom(false, 'auto');
  }, [messages, isLoading]);

  useEffect(() => {
    if (!messagesInnerRef.current) return;
    const observer = new ResizeObserver(() => {
      // Use instant scroll when the container resizes rapidly (e.g. markdown loads)
      scrollToBottom(false, 'auto');
    });
    observer.observe(messagesInnerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'model' && !lastMessage.paymentUrl) {
      const text = String(lastMessage.text).toLowerCase();
      if (text.includes('manual approval') || text.includes('approval required') || text.includes('paused for review') || text.includes('exceeds')) {
        let isMounted = true;
        
        const pollStatus = async () => {
          try {
            const response = await fetch(`http://localhost:3005/api/chat/status?sessionId=${sessionId}`);
            if (!isMounted) return false;
            const data = await response.json();
            
            if (data.status === 'payment_link_ready' && data.paymentUrl) {
              setMessages(prev => {
                const newMessages = [...prev];
                // Update the last message with the new paymentUrl so PaymentTracker mounts
                if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'model') {
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    paymentUrl: data.paymentUrl
                  };
                }
                return newMessages;
              });
              return true;
            }
          } catch (e) {
            console.error("Polling chat status failed:", e);
          }
          return false;
        };

        // Initial check immediately
        pollStatus().then(found => {
            if (!found && isMounted) {
                const intervalId = setInterval(async () => {
                  const done = await pollStatus();
                  if (done) clearInterval(intervalId);
                }, 3000);
                // Clean up interval
                return () => clearInterval(intervalId);
            }
        });

        return () => {
          isMounted = false;
        };
      }
    }
  }, [messages, sessionId]);

  useEffect(() => {
    if (!isLoading) {
      // Small timeout ensures the input is re-enabled before focusing
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isLoading]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (buyerMode === 'human') {
      const userMessage = { role: 'user', text: input };
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);
      setTimeout(() => scrollToBottom(true), 50);

      try {
        const response = await fetch('http://localhost:3005/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message: userMessage.text })
        });
        const data = await response.json();
        console.log("=== AURA PAYMENT DEBUG ===");
        console.log("FULL CHAT RESPONSE:", data);
        console.log("data.reply:", data.reply);
        console.log("data.link:", data.link);
        console.log("typeof data.link:", typeof data.link);
        setMessages(prev => [...prev, { role: 'model', text: data.reply, paymentUrl: data.link || null }]);
      } catch (error) {
        setMessages(prev => [...prev, { role: 'model', text: "Error connecting to the Aura agent. Please ensure the backend is running." }]);
      } finally {
        setIsLoading(false);
      }
    } else {
      // AI Buyer Mode
      const userMessage = { role: 'user', text: `[Intent] ${input}` };
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);
      setTimeout(() => scrollToBottom(true), 50);

      try {
        const response = await fetch('http://localhost:3005/api/ai-buyer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, intent: input })
        });
        const data = await response.json();

        if (data.transcript) {
          const mappedTranscript = data.transcript.map(t => ({
            role: t.role === 'ai_buyer' ? 'user' : (t.role === 'merchant' ? 'model' : t.role),
            text: t.role === 'ai_buyer' ? `[AI Buyer] ${t.text}` : t.text
          }));
          setMessages(prev => [...prev, ...mappedTranscript]);
        }
      } catch (error) {
        setMessages(prev => [...prev, { role: 'system', text: "Error executing AI Buyer journey." }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const processVoiceInput = async (spokenText) => {
    if (!spokenText.trim()) return;

    voiceService.stopListening();

    if (buyerMode === 'human') {
      const userMessage = { role: 'user', text: spokenText };
      setMessages(prev => [...prev, userMessage]);
      setVoiceState('PROCESSING');
      setIsLoading(true);
      setTimeout(() => scrollToBottom(true), 50);

      try {
        const response = await fetch('http://localhost:3005/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message: userMessage.text })
        });
        const data = await response.json();

        // Render UI immediately!
        setMessages(prev => [...prev, { role: 'model', text: data.reply, paymentUrl: data.link }]);

        setVoiceState('PROCESSING');

        // Fetch concise voice summary asynchronously
        fetch('http://localhost:3005/api/voice-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.reply })
        }).then(res => res.json()).then(summaryData => {
          setVoiceState('SPEAKING');

          let finalTTS = summaryData.voiceReply;
          if (!finalTTS || finalTTS.length > 300) {
            finalTTS = data.link
              ? "Your payment link is ready. Please check the screen to continue."
              : "Your request has been processed. Please check the details on screen.";
          }

          console.log("=== AURA VOICE DEBUG ===");
          console.log("Original response length:", data.reply?.length || 0);
          console.log("Voice summary:", summaryData.voiceReply);
          console.log("Voice summary length:", summaryData.voiceReply?.length || 0);
          console.log("TTS text:", finalTTS);

          voiceService.speak(finalTTS, () => {
            setVoiceState('IDLE');
          });
        }).catch(err => {
          console.error('Voice summary failed', err);
          setVoiceState('SPEAKING');

          const fallbackTTS = data.link
            ? "Your payment link is ready. Please check the screen to continue."
            : "Your request has been processed. Please check the details on screen.";

          console.log("=== AURA VOICE DEBUG ===");
          console.log("Original response length:", data.reply?.length || 0);
          console.log("Voice summary: [FAILED]");
          console.log("TTS text:", fallbackTTS);

          voiceService.speak(fallbackTTS, () => {
            setVoiceState('IDLE');
          });
        });

      } catch (error) {
        setMessages(prev => [...prev, { role: 'model', text: "Error connecting to the Aura agent." }]);
        setVoiceState('IDLE');
      } finally {
        setIsLoading(false);
      }
    } else {
      // AI Buyer Mode
      const userMessage = { role: 'user', text: `[Intent] ${spokenText}` };
      setMessages(prev => [...prev, userMessage]);
      setVoiceState('PROCESSING');
      setIsLoading(true);
      setTimeout(() => scrollToBottom(true), 50);

      try {
        const response = await fetch('http://localhost:3005/api/ai-buyer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, intent: spokenText })
        });
        const data = await response.json();

        if (data.transcript) {
          const mappedTranscript = data.transcript.map(t => ({
            role: t.role === 'ai_buyer' ? 'user' : (t.role === 'merchant' ? 'model' : t.role),
            text: t.role === 'ai_buyer' ? `[AI Buyer] ${t.text}` : t.text
          }));
          setMessages(prev => [...prev, ...mappedTranscript]);

          const lastMessage = data.transcript[data.transcript.length - 1];
          if (lastMessage) {
            setVoiceState('PROCESSING');
            fetch('http://localhost:3005/api/voice-summary', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: lastMessage.text })
            }).then(res => res.json()).then(summaryData => {
              setVoiceState('SPEAKING');

              let finalTTS = summaryData.voiceReply;
              if (!finalTTS || finalTTS.length > 300) {
                finalTTS = "Your request has been processed. Please check the details on screen.";
              }

              console.log("=== AURA VOICE DEBUG ===");
              console.log("Original response length:", lastMessage.text?.length || 0);
              console.log("Voice summary:", summaryData.voiceReply);
              console.log("Voice summary length:", summaryData.voiceReply?.length || 0);
              console.log("TTS text:", finalTTS);

              voiceService.speak(finalTTS, () => {
                setVoiceState('IDLE');
              });
            }).catch(err => {
              console.error('Voice summary failed', err);
              setVoiceState('SPEAKING');

              const fallbackTTS = "Your request has been processed. Please check the details on screen.";

              console.log("=== AURA VOICE DEBUG ===");
              console.log("Original response length:", lastMessage.text?.length || 0);
              console.log("Voice summary: [FAILED]");
              console.log("TTS text:", fallbackTTS);

              voiceService.speak(fallbackTTS, () => {
                setVoiceState('IDLE');
              });
            });
          } else {
            setVoiceState('IDLE');
          }
        } else {
          setVoiceState('IDLE');
        }
      } catch (error) {
        setMessages(prev => [...prev, { role: 'system', text: "Error executing AI Buyer journey." }]);
        setVoiceState('IDLE');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const toggleVoice = (e) => {
    e.preventDefault();
    if (!voiceService.isSupported()) {
      alert("Microphone access or Speech Recognition is not supported in this browser.");
      return;
    }

    if (voiceState === 'IDLE') {
      setVoiceState('LISTENING');
      voiceService.startListening(
        (transcript) => processVoiceInput(transcript),
        (error) => {
          console.error("Voice error:", error);
          if (error === 'not-allowed') {
            alert("Microphone access is required for voice conversations. Please allow it in your browser settings.");
          }
          setVoiceState('IDLE');
        },
        () => setVoiceState(prev => prev === 'LISTENING' ? 'IDLE' : prev)
      );
    } else if (voiceState === 'LISTENING') {
      voiceService.stopListening();
      setVoiceState('IDLE');
    } else if (voiceState === 'SPEAKING') {
      voiceService.stopSpeaking();
      setVoiceState('IDLE');
    }
  };

  return (
    <div className="app-container">
      {showDashboard ? (
        <div className="fullscreen-dashboard">
          <div className="dashboard-header">
            <button className="btn-back" onClick={() => setShowDashboard(false)}>
              ← Back to Aura
            </button>
          </div>
          <div className="dashboard-content">
            <Dashboard />
          </div>
        </div>
      ) : (
        <div className="main-layout customer-focused">
          <div className="chat-window primary-focus">
            <header className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1>
                  Aura Commerce
                  <span>AI Concierge</span>
                </h1>
                <div className="mode-toggle" style={{ marginTop: '10px', display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '5px', borderRadius: '8px' }}>
                  <button
                    style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '4px', background: buyerMode === 'human' ? 'rgba(255,255,255,0.2)' : 'transparent', color: '#fff', cursor: 'pointer' }}
                    onClick={() => setBuyerMode('human')}
                  >
                    Customer Mode
                  </button>
                  <button
                    style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '4px', background: buyerMode === 'ai' ? 'rgba(255,255,255,0.2)' : 'transparent', color: '#fff', cursor: 'pointer' }}
                    onClick={() => setBuyerMode('ai')}
                  >
                    AI Buyer Mode
                  </button>
                </div>
              </div>
              <button
                className="btn-merchant-toggle"
                onClick={() => setShowDashboard(true)}
              >
                MERCHANT DASHBOARD
              </button>
            </header>
            <div className="messages-container" ref={messagesContainerRef} onScroll={handleScroll}>
              <div className="messages-inner" ref={messagesInnerRef}>
                {messages.length === 0 && (
                  <div className="empty-state">
                    <p>Hello, I am Aura.<br />Your Intelligent Shopping Concierge.</p>
                    {buyerMode === 'ai' && <p style={{ fontSize: '0.9em', color: 'rgba(255,255,255,0.6)', marginTop: '10px' }}>AI Buyer Mode Active. Enter a shopping intent to begin.</p>}
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`message ${msg.role}`}>
                    <div className="message-content">
                      {(() => {
                        if (!msg.text) return <p>Sorry, I received an invalid response.</p>;

                        const safeText = normalizeMessageContent(msg.text);
                        const safePaymentUrl = msg.paymentUrl || (typeof msg.text === 'object' ? msg.text.paymentLink : null);

                        return (
                          <>
                            <div className="markdown-body">
                              <ReactMarkdown>{safeText}</ReactMarkdown>
                            </div>
                            {safePaymentUrl && (
                              <PaymentTracker url={safePaymentUrl} />
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                {isLoading && <div className="message model"><div className="message-content loading">{buyerMode === 'human' ? 'Aura is thinking...' : 'AI Buyer is negotiating...'}</div></div>}
                <div ref={messagesEndRef} style={{ height: '40px', flexShrink: 0, width: '100%' }} />
              </div>
            </div>
            <form onSubmit={sendMessage} className="chat-input-form">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={buyerMode === 'human' ? "Ask about our products..." : "E.g. Find me the best headphones under 5000"}
                disabled={isLoading || voiceState !== 'IDLE'}
              />
              <button
                type="button"
                className={`btn-voice ${voiceState.toLowerCase()}`}
                onClick={toggleVoice}
                disabled={isLoading && voiceState !== 'SPEAKING'}
              >
                {voiceState === 'IDLE' && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block' }}>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="22"></line>
                  </svg>
                )}
                {voiceState === 'LISTENING' && '🔴 Listening...'}
                {voiceState === 'PROCESSING' && '◌ Processing...'}
                {voiceState === 'SPEAKING' && '■ Stop'}
              </button>
              <button type="submit" disabled={isLoading || voiceState !== 'IDLE'}>Send</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
