/**
 * components/ChatBot.jsx
 * Modern, responsive AI Financial Assistant Chatbot.
 * Allows users to ask financial questions, check summaries, and receive Gen AI answers.
 */

import { useState, useRef, useEffect } from 'react';
import { chatService } from '../services/api';
import '../styles/ChatBot.css';

const DEFAULT_SUGGESTIONS = [
  "What is my current total expense?",
  "How many invoices are pending?",
  "Give me tips to optimize cashflow",
  "How do tax write-offs work for business expenses?"
];

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: "Hello! 👋 I'm **Expenza AI**, your personal financial assistant. How can I help you analyze your invoices, expenses, or financial strategy today?",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      // Pass the conversation history so the chatbot has full context
      const response = await chatService.sendMessage(query, messages);
      const botReply = response.data?.reply || "I didn't receive a response. Please try again.";

      const botMessage = {
        id: Date.now() + 1,
        sender: 'bot',
        text: botReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      const errMsg =
        err.response?.data?.error ||
        "Sorry, I encountered an error connecting to the AI assistant. Please check backend API keys or network connection.";

      const errBotMessage = {
        id: Date.now() + 1,
        sender: 'bot',
        text: `⚠️ ${errMsg}`,
        isError: true,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, errBotMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleSendMessage();
  };

  // Simple formatter for basic markdown elements like bold, bullet points
  const renderFormattedText = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      // replace **bold** with <strong>
      const formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return (
        <p
          key={i}
          dangerouslySetInnerHTML={{ __html: formattedLine }}
          style={{ margin: line === '' ? '4px 0' : '2px 0' }}
        />
      );
    });
  };

  return (
    <div className="chatbot-wrapper">
      {!isOpen && (
        <button
          className="chatbot-trigger-btn"
          onClick={() => setIsOpen(true)}
          title="Open AI Financial Assistant"
          aria-label="Open AI Financial Assistant"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span className="chatbot-pulse-dot" />
        </button>
      )}

      {isOpen && (
        <div className="chatbot-window">
          {/* Header */}
          <div className="chatbot-header">
            <div className="chatbot-header-left">
              <div className="chatbot-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
                  <path d="M21.18 8.02A10 10 0 0 0 14 2.06V12l7.18-3.98z"></path>
                </svg>
              </div>
              <div className="chatbot-title-box">
                <h4>Expenza AI</h4>
                <div className="chatbot-status-row">
                  <span className="chatbot-online-indicator"></span>
                  <span>Financial Advisor Active</span>
                </div>
              </div>
            </div>
            <button
              className="chatbot-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close Chat"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Quick suggestions */}
          <div className="chatbot-suggestions">
            {DEFAULT_SUGGESTIONS.map((item, idx) => (
              <button
                key={idx}
                className="chatbot-chip"
                onClick={() => handleSendMessage(item)}
                disabled={loading}
              >
                {item}
              </button>
            ))}
          </div>

          {/* Message History */}
          <div className="chatbot-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`chatbot-msg-row ${msg.sender}`}>
                <div className="chatbot-msg-avatar">
                  {msg.sender === 'bot' ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  )}
                </div>
                <div className="chatbot-msg-bubble">
                  {renderFormattedText(msg.text)}
                  <span className="chatbot-msg-time">{msg.time}</span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="chatbot-msg-row bot">
                <div className="chatbot-msg-avatar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                </div>
                <div className="chatbot-msg-bubble chatbot-typing">
                  <span className="chatbot-typing-dot"></span>
                  <span className="chatbot-typing-dot"></span>
                  <span className="chatbot-typing-dot"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input field */}
          <div className="chatbot-input-container">
            <form className="chatbot-form" onSubmit={handleFormSubmit}>
              <input
                type="text"
                className="chatbot-input"
                placeholder="Ask financial question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
              />
              <button
                type="submit"
                className="chatbot-send-btn"
                disabled={!input.trim() || loading}
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
