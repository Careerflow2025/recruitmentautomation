'use client';

import { useState, useEffect, useRef } from 'react';

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{q: string; a: string}>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = false;
        recognitionInstance.lang = 'en-GB'; // British English

        recognitionInstance.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setQuestion(prev => prev + (prev ? ' ' : '') + transcript);
          setIsRecording(false);
        };

        recognitionInstance.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsRecording(false);
        };

        recognitionInstance.onend = () => {
          setIsRecording(false);
        };

        setRecognition(recognitionInstance);
      }
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, loading, isOpen]);

  const ask = async () => {
    if (!question.trim()) return;

    setLoading(true);
    const currentQuestion = question;

    // Add question to chat immediately
    setChatHistory(prev => [...prev, { q: currentQuestion, a: '' }]);
    setQuestion('');

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: currentQuestion })
      });

      // Check if response has content
      const text = await response.text();

      if (!text) {
        throw new Error('Empty response from AI server. The request may have timed out.');
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Response text:', text);
        throw new Error('Invalid response format from AI server. Response: ' + text.substring(0, 100));
      }

      if (!response.ok) {
        // Show detailed error from API
        const errorMsg = result.details || result.error || 'Failed to get answer';
        throw new Error(errorMsg);
      }

      // Update the last message with the answer
      setChatHistory(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1].a = result.answer;
        return newHistory;
      });
    } catch (err: any) {
      console.error('AI Chat Error:', err);

      // Show user-friendly error message
      let errorMessage = err.message;

      if (errorMessage.includes('ANTHROPIC_API_KEY')) {
        errorMessage = '❌ API Key Error: Please check that your Anthropic API key is properly configured in .env.local file';
      } else if (errorMessage.includes('Invalid API Key')) {
        errorMessage = '❌ Invalid API Key: Your Anthropic API key appears to be invalid. Please verify it at https://console.anthropic.com';
      } else if (errorMessage.includes('Rate Limit')) {
        errorMessage = '❌ Rate Limit: Too many requests. Please wait a moment and try again.';
      } else if (!errorMessage.includes('❌')) {
        errorMessage = `❌ Error: ${errorMessage}`;
      }

      setChatHistory(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1].a = errorMessage;
        return newHistory;
      });
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    if (confirm('Clear all chat history?')) {
      setChatHistory([]);
      setQuestion('');
    }
  };

  const toggleRecording = () => {
    if (!recognition) {
      alert('Voice input is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      try {
        recognition.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Error starting recognition:', err);
        setIsRecording(false);
      }
    }
  };

  const exampleQuestions = [
    "How many dental nurses are available?",
    "Show me candidates within 30 minutes of SW1A 1AA",
    "Which clients need a receptionist in London?",
    "How many new candidates were added this week?",
    "What are the most common roles?",
    "Show me all matches for dental nurses",
    "Which candidates are looking for part-time work?",
    "List clients with the highest pay rates",
  ];

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-full shadow-2xl hover:shadow-purple-500/50 hover:scale-110 transition-all duration-200 flex items-center justify-center text-3xl z-50 border-4 border-white"
          title="Open AI Assistant"
        >
          ⚡
        </button>
      )}

      {/* Full Screen Chat Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-blue-600 text-white p-6 flex justify-between items-center shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-3xl">
                  ⚡
                </div>
                <div>
                  <h2 className="text-2xl font-bold">AI Laser Assistant</h2>
                  <p className="text-sm opacity-90">Ask me anything about your candidates, clients, and matches</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20 rounded-lg px-4 py-2 text-lg font-bold transition-colors"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-white">
              <div className="max-w-4xl mx-auto p-6 space-y-6">
                {/* Welcome Message */}
                {chatHistory.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center text-5xl mx-auto mb-6">
                      🤖
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-3">
                      Hello! I'm your AI assistant
                    </h3>
                    <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
                      I can help you find candidates, analyze matches, answer questions about your recruitment data,
                      and provide insights about your dental practice network. Just ask me anything!
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto">
                      {exampleQuestions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => setQuestion(q)}
                          className="text-left px-4 py-3 bg-white border-2 border-purple-200 rounded-lg hover:bg-purple-50 hover:border-purple-400 transition-all shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-purple-600 font-bold">💡</span>
                            <span className="text-sm text-gray-700">{q}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat History */}
                {chatHistory.map((item, i) => (
                  <div key={i} className="space-y-4">
                    {/* User Question */}
                    <div className="flex justify-end">
                      <div className="max-w-3xl">
                        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl rounded-tr-sm px-6 py-4 shadow-md">
                          <p className="text-base leading-relaxed">{item.q}</p>
                        </div>
                      </div>
                    </div>

                    {/* AI Answer */}
                    {item.a && (
                      <div className="flex justify-start">
                        <div className="max-w-3xl">
                          <div className="flex gap-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">
                              🤖
                            </div>
                            <div className="bg-white border-2 border-gray-200 rounded-2xl rounded-tl-sm px-6 py-4 shadow-sm">
                              <div className="text-gray-800 text-base leading-relaxed whitespace-pre-wrap">{item.a}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading Indicator */}
                {loading && (
                  <div className="flex justify-start">
                    <div className="max-w-3xl">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center text-xl">
                          🤖
                        </div>
                        <div className="bg-white border-2 border-gray-200 rounded-2xl rounded-tl-sm px-6 py-4 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                            <span className="text-gray-600 text-sm">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="border-t-2 border-gray-200 bg-white p-6">
              <div className="max-w-4xl mx-auto">
                <div className="flex gap-3 items-end">
                  <div className="flex-1 relative">
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !loading) {
                          e.preventDefault();
                          ask();
                        }
                      }}
                      placeholder="Ask me anything... (Press Enter to send, Shift+Enter for new line)"
                      className="w-full px-4 py-3 pr-14 border-2 border-gray-300 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-900 font-medium placeholder:text-gray-400"
                      rows={3}
                      disabled={loading || isRecording}
                    />
                    {/* Microphone Button Inside Textarea */}
                    <button
                      onClick={toggleRecording}
                      disabled={loading}
                      className={`absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all shadow-md ${
                        isRecording
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:shadow-lg hover:scale-110'
                      }`}
                      title={isRecording ? 'Recording... Click to stop' : 'Click to speak'}
                    >
                      {isRecording ? '⏹️' : '🎤'}
                    </button>
                  </div>
                  <button
                    onClick={ask}
                    disabled={loading || !question.trim()}
                    className={`px-8 py-3 rounded-xl text-base font-bold transition-all shadow-md ${
                      loading || !question.trim()
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-lg hover:scale-105'
                    }`}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Sending...</span>
                      </div>
                    ) : (
                      <span>Send ➤</span>
                    )}
                  </button>
                </div>

                <div className="flex justify-between items-center mt-3 text-sm text-gray-600">
                  <div className="flex gap-4">
                    {chatHistory.length > 0 && (
                      <button
                        onClick={clearHistory}
                        className="hover:text-red-600 underline"
                      >
                        🗑️ Clear history
                      </button>
                    )}
                    <span className="text-gray-400">
                      {chatHistory.length} message{chatHistory.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
