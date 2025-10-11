'use client';

import { useState, useEffect, useRef } from 'react';
import { CommuteMapModal } from '../matches/CommuteMapModal';

// Simple Markdown-like formatter for AI responses
function FormattedResponse({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let currentListItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (currentListItems.length > 0 && listType) {
      const ListTag = listType;
      elements.push(
        <ListTag key={`list-${elements.length}`} className="my-3 space-y-1.5 pl-6">
          {currentListItems.map((item, i) => (
            <li key={i} className="text-gray-800 leading-relaxed">
              {renderInlineFormatting(item)}
            </li>
          ))}
        </ListTag>
      );
      currentListItems = [];
      listType = null;
    }
  };

  const renderInlineFormatting = (text: string) => {
    // Handle bold **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong class="font-bold text-gray-900">$1</strong>');

    // Handle italic *text* or _text_
    text = text.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');
    text = text.replace(/_(.+?)_/g, '<em class="italic">$1</em>');

    // Handle inline code `code`
    text = text.replace(/`(.+?)`/g, '<code class="bg-gray-100 text-purple-700 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');

    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Empty line
    if (!line.trim()) {
      flushList();
      elements.push(<div key={`empty-${i}`} className="h-2" />);
      continue;
    }

    // Headers (### Header)
    if (line.match(/^#{1,6}\s/)) {
      flushList();
      const level = line.match(/^(#{1,6})/)?.[1].length || 1;
      const text = line.replace(/^#{1,6}\s/, '');
      const HeadingTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
      const sizeClass = level === 1 ? 'text-2xl' : level === 2 ? 'text-xl' : level === 3 ? 'text-lg' : 'text-base';
      elements.push(
        <HeadingTag key={`heading-${i}`} className={`${sizeClass} font-bold text-gray-900 mt-4 mb-2`}>
          {renderInlineFormatting(text)}
        </HeadingTag>
      );
      continue;
    }

    // Bullet list (• or - or *)
    if (line.match(/^[•\-\*]\s/)) {
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      currentListItems.push(line.replace(/^[•\-\*]\s/, ''));
      continue;
    }

    // Numbered list (1. or 1️⃣)
    if (line.match(/^\d+[\.\)]\s/) || line.match(/^\d+️⃣\s/)) {
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      currentListItems.push(line.replace(/^\d+[\.\)]\s/, '').replace(/^\d+️⃣\s/, ''));
      continue;
    }

    // Section dividers (═══ or ---)
    if (line.match(/^[═\-]{3,}$/)) {
      flushList();
      elements.push(
        <hr key={`hr-${i}`} className="my-4 border-t-2 border-gray-200" />
      );
      continue;
    }

    // Code block detection (start and end with ```)
    if (line.trim() === '```json' || line.trim() === '```') {
      flushList();
      const codeLines: string[] = [];
      i++; // Skip opening ```
      while (i < lines.length && lines[i].trim() !== '```') {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={`code-${i}`} className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto my-3 text-sm font-mono">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Status badges (✅, ❌, 🔄, etc. at start of line)
    if (line.match(/^[✅❌🔄📊💼📞🎯🟢🟡🔴]/)) {
      flushList();
      elements.push(
        <div key={`badge-${i}`} className="flex items-start gap-2 my-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
          <span className="text-xl flex-shrink-0">{line.match(/^[✅❌🔄📊💼📞🎯🟢🟡🔴]/)?.[0]}</span>
          <span className="text-gray-800 leading-relaxed">{renderInlineFormatting(line.slice(2))}</span>
        </div>
      );
      continue;
    }

    // Section headers with emoji (🎯 TEXT, 📊 TEXT, etc.)
    if (line.match(/^[🎯📊💼📞🔧🧠👁️⚡🏗️💬]\s/)) {
      flushList();
      elements.push(
        <div key={`section-${i}`} className="mt-4 mb-2 pb-2 border-b-2 border-purple-200">
          <span className="text-lg font-bold text-purple-700">{line}</span>
        </div>
      );
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="text-gray-800 text-base leading-relaxed my-2">
        {renderInlineFormatting(line)}
      </p>
    );
  }

  // Flush any remaining list
  flushList();

  return <div className="space-y-1">{elements}</div>;
}

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{q: string; a: string}>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Multi-map panel state (up to 3 maps side-by-side)
  const [mapPanelMaps, setMapPanelMaps] = useState<Array<{
    id: string;
    originPostcode: string;
    destinationPostcode: string;
    candidateName: string;
    clientName: string;
    commuteMinutes: number;
    commuteDisplay: string;
  }>>([]);

  // Enlarged map modal state
  const [enlargedMapIndex, setEnlargedMapIndex] = useState<number | null>(null);

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

  // Process AI response for map actions (supports multiple maps)
  const processMapActions = (response: string) => {
    // Match all MAP_ACTION occurrences (handles nested JSON with double closing braces)
    const mapActionRegex = /MAP_ACTION:(\{[\s\S]*?\}\})/g;
    const matches = Array.from(response.matchAll(mapActionRegex));

    if (matches.length > 0) {
      const newMaps: typeof mapPanelMaps = [];

      for (const match of matches.slice(0, 3)) { // Max 3 maps
        try {
          const mapAction = JSON.parse(match[1]);
          if (mapAction.action === 'openMap' && mapAction.data) {
            newMaps.push({
              id: `map_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              originPostcode: mapAction.data.originPostcode,
              destinationPostcode: mapAction.data.destinationPostcode,
              candidateName: mapAction.data.candidateName,
              clientName: mapAction.data.clientName,
              commuteMinutes: mapAction.data.commuteMinutes,
              commuteDisplay: mapAction.data.commuteDisplay,
            });
          }
        } catch (e) {
          console.error('Error parsing map action:', e);
        }
      }

      if (newMaps.length > 0) {
        setMapPanelMaps(newMaps);
      }
    }
  };

  // Remove a map from panel
  const removeMap = (mapId: string) => {
    setMapPanelMaps(prev => prev.filter(m => m.id !== mapId));
  };

  // Clean response text by removing MAP_ACTION markers (handles nested JSON)
  const cleanResponse = (response: string) => {
    return response.replace(/MAP_ACTION:\{[\s\S]*?\}\}/g, '').trim();
  };

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
        body: JSON.stringify({ question: currentQuestion, sessionId })
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
        const cleanedAnswer = cleanResponse(result.answer);
        newHistory[newHistory.length - 1].a = cleanedAnswer;
        return newHistory;
      });

      // Process any map actions in the response
      processMapActions(result.answer);

      // Store sessionId for future requests
      if (result.sessionId && !sessionId) {
        setSessionId(result.sessionId);
      }

      // Log context information for debugging
      if (result.contextInfo && process.env.NODE_ENV === 'development') {
        console.log('AI Context Info:', result.contextInfo);
      }
    } catch (err: any) {
      console.error('AI Chat Error:', err);

      // Show user-friendly error message
      let errorMessage = err.message;

      if (errorMessage.includes('ANTHROPIC_API_KEY')) {
        errorMessage = '❌ API Key Error: Please check that your Anthropic API key is properly configured in .env.local file';
      } else if (errorMessage.includes('Invalid API Key')) {
        errorMessage = '❌ Invalid API Key: Your Anthropic API key appears to be invalid. Please verify it at https://console.anthropic.com';
      } else if (errorMessage.includes('Rate Limit') || errorMessage.includes('Service Temporarily Busy') || errorMessage.includes('AI Service Rate Limit')) {
        errorMessage = '⏳ System is temporarily busy processing multiple user requests. Please try again in a few seconds.';
      } else if (errorMessage.includes('Daily Limit Reached')) {
        errorMessage = '📊 Daily API limit reached. Please try again tomorrow or contact support for increased limits.';
      } else if (errorMessage.includes('Request Too Large')) {
        errorMessage = '📋 Request too large. Try asking about specific candidates, clients, or matches instead of general queries.';
      } else if (errorMessage.includes('Empty response')) {
        errorMessage = '⏳ Server is processing your request. Please try again in a moment.';
      } else if (errorMessage.includes('timed out')) {
        errorMessage = '⏳ Request timed out. The server may be busy - please try again in a few seconds.';
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
      setSessionId(null); // Reset session to start fresh
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
    "Bring me the candidate phone number the one that matched",
    "Open the map for the best match and show me the commute route",
    "Show me all matches with commute routes and map links",
    "Which candidates are placed and what are their details?",
    "Show me nurses within 20 minutes of central London",
    "Open the map for CAN1735900014UIO to show their commute route",
    "What's the average commute time for role matches?",
    "Show me the route between the best candidate and client",
    "Which matches are in-progress and need follow-up?",
    "Show me candidates with phone numbers for quick contact",
    "Display all matches for CL[ID] with Google Maps routes",
    "Open the commute map for the shortest travel time match",
    "Which clients need urgent placement (recent additions)?",
    "Show me match success rates by role type",
    "Open the map to visualize the best commute route",
    "What matches have notes and what do they say?",
    "Display commute analysis for all current matches",
    "Show me candidates available for part-time roles",
    "Open the map for any match under 20 minutes commute",
    "Which matches were recently marked as placed?",
    "Get me contact details for candidates in [postcode area]",
    "Show route visualization for matches under 30 minutes",
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
          🤖
        </button>
      )}

      {/* Full Screen Chat Modal with Map Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full h-[90vh] bg-white rounded-2xl shadow-2xl flex overflow-hidden transition-all duration-300 ${
            mapPanelMaps.length > 0 ? 'max-w-[95vw]' : 'max-w-5xl'
          }`}>
            {/* CHAT SECTION (LEFT) */}
            <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-blue-600 text-white p-6 flex justify-between items-center shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-3xl">
                  🤖
                </div>
                <div>
                  <h2 className="text-2xl font-bold">AI Matcher Assistant</h2>
                  <p className="text-sm opacity-90">Complete access to matches, commutes, maps, and recruitment data</p>
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
                      I have full access to your recruitment system including candidate details, client information, 
                      match data with commute calculations, status tracking, notes, and Google Maps integration. 
                      I can provide phone numbers, map links, placement status, and comprehensive analytics.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl mx-auto">
                      {exampleQuestions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => setQuestion(q)}
                          className="text-left px-4 py-3 bg-white border-2 border-purple-200 rounded-lg hover:bg-purple-50 hover:border-purple-400 transition-all shadow-sm hover:shadow-md"
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-purple-600 font-bold">🎯</span>
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
                              <FormattedResponse text={item.a} />
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

            {/* MAP PANEL (RIGHT) - Shows up to 3 maps */}
            {mapPanelMaps.length > 0 && (
              <div className="w-[600px] border-l-2 border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
                {/* Map Panel Header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🗺️</span>
                    <h3 className="text-lg font-bold">{mapPanelMaps.length} Map{mapPanelMaps.length > 1 ? 's' : ''}</h3>
                  </div>
                  <button
                    onClick={() => setMapPanelMaps([])}
                    className="hover:bg-white/20 rounded-lg px-3 py-1 text-sm font-bold transition-colors"
                  >
                    Close All ✕
                  </button>
                </div>

                {/* Maps Grid */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {mapPanelMaps.map((map, index) => (
                    <div
                      key={map.id}
                      className="bg-white rounded-xl shadow-lg overflow-hidden border-2 border-gray-200 hover:border-purple-400 transition-all cursor-pointer"
                      onClick={() => setEnlargedMapIndex(index)}
                    >
                      {/* Map Header */}
                      <div className="bg-gradient-to-r from-gray-700 to-gray-800 text-white p-3 flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-bold text-sm mb-1">{map.candidateName}</div>
                          <div className="text-xs opacity-90">→ {map.clientName}</div>
                          <div className="text-xs font-bold mt-1 text-green-300">{map.commuteDisplay}</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMap(map.id);
                          }}
                          className="hover:bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-sm"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Map Preview */}
                      <div className="relative h-48 overflow-hidden">
                        <CommuteMapModal
                          isOpen={true}
                          onClose={() => {}}
                          originPostcode={map.originPostcode}
                          destinationPostcode={map.destinationPostcode}
                          candidateName={map.candidateName}
                          clientName={map.clientName}
                          commuteMinutes={map.commuteMinutes}
                          commuteDisplay={map.commuteDisplay}
                          embedded={true}
                        />
                        <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
                          <div className="bg-white/90 px-4 py-2 rounded-full text-sm font-bold text-gray-800">
                            Click to Enlarge
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enlarged Map Modal */}
      {enlargedMapIndex !== null && mapPanelMaps[enlargedMapIndex] && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-6xl h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
            <CommuteMapModal
              isOpen={true}
              onClose={() => setEnlargedMapIndex(null)}
              originPostcode={mapPanelMaps[enlargedMapIndex].originPostcode}
              destinationPostcode={mapPanelMaps[enlargedMapIndex].destinationPostcode}
              candidateName={mapPanelMaps[enlargedMapIndex].candidateName}
              clientName={mapPanelMaps[enlargedMapIndex].clientName}
              commuteMinutes={mapPanelMaps[enlargedMapIndex].commuteMinutes}
              commuteDisplay={mapPanelMaps[enlargedMapIndex].commuteDisplay}
            />
          </div>
        </div>
      )}
    </>
  );
}
