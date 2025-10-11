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
      {/* Floating Button - Clean Minimal */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-white text-gray-700 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200 flex items-center justify-center z-50 border border-gray-200"
          title="Open AI Assistant"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}

      {/* Full Screen Chat Modal - Clean ChatGPT Style */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full h-[92vh] bg-white rounded-lg shadow-xl flex overflow-hidden transition-all duration-200 ${
            mapPanelMaps.length > 0 ? 'max-w-[96vw]' : 'max-w-6xl'
          }`}>
            {/* CHAT SECTION (LEFT) */}
            <div className="flex-1 flex flex-col min-w-0">
            {/* Header - Polished ChatGPT Style */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 shadow-sm rounded-t-lg">
              <div className="text-lg font-semibold text-gray-800">
                AI Assistant
                <p className="text-sm text-gray-500 font-normal">Intelligent recruitment matching</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-colors"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto bg-white">
              <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                {/* Welcome Message - Clean Minimal */}
                {chatHistory.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-6">
                      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-semibold text-gray-800 mb-3">
                      How can I help you today?
                    </h3>
                    <p className="text-gray-500 text-sm mb-8 max-w-md mx-auto">
                      Ask me about candidates, clients, matches, or commute analysis
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                      {exampleQuestions.slice(0, 6).map((q, i) => (
                        <button
                          key={i}
                          onClick={() => setQuestion(q)}
                          className="text-left px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm text-gray-700"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chat History - Clean ChatGPT Style */}
                {chatHistory.map((item, i) => (
                  <div key={i} className="space-y-4">
                    {/* User Question - Clean */}
                    <div className="flex justify-end">
                      <div className="max-w-2xl bg-gray-100 rounded-2xl px-5 py-3">
                        <p className="text-gray-800 text-sm leading-relaxed">{item.q}</p>
                      </div>
                    </div>

                    {/* AI Answer - Clean */}
                    {item.a && (
                      <div className="flex justify-start">
                        <div className="max-w-2xl">
                          <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
                            <FormattedResponse text={item.a} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading Indicator - Clean */}
                {loading && (
                  <div className="flex justify-start">
                    <div className="max-w-2xl bg-white border border-gray-200 rounded-2xl px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Input Area - Clean ChatGPT Style */}
            <div className="border-t border-gray-200 bg-white p-4">
              <div className="max-w-3xl mx-auto">
                <div className="flex gap-2 items-end">
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
                      placeholder="Message AI Assistant..."
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:border-gray-400 text-gray-900 placeholder:text-gray-400 bg-white transition-colors"
                      rows={1}
                      disabled={loading || isRecording}
                    />
                    {/* Microphone Button */}
                    <button
                      onClick={toggleRecording}
                      disabled={loading}
                      className={`absolute bottom-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        isRecording
                          ? 'bg-red-500 text-white'
                          : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                      }`}
                      title={isRecording ? 'Recording... Click to stop' : 'Click to speak'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={ask}
                    disabled={loading || !question.trim()}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      loading || !question.trim()
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-800 text-white hover:bg-gray-700'
                    }`}
                  >
                    {loading ? (
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <span>Send</span>
                    )}
                  </button>
                </div>

                <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                  {chatHistory.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="hover:text-gray-600 transition-colors"
                    >
                      Clear history
                    </button>
                  )}
                </div>
              </div>
            </div>
            </div>

            {/* MAP PANEL (RIGHT) - Clean Minimal */}
            {mapPanelMaps.length > 0 && (
              <div className="w-[600px] border-l border-gray-200 bg-white flex flex-col overflow-hidden">
                {/* Map Panel Header - Polished to Match AI Assistant */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 shadow-sm">
                  <div className="text-lg font-semibold text-gray-800">
                    {mapPanelMaps.length} Route{mapPanelMaps.length > 1 ? 's' : ''}
                    <p className="text-sm text-gray-500 font-normal">Commute visualization</p>
                  </div>
                  <button
                    onClick={() => setMapPanelMaps([])}
                    className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-2 text-sm transition-colors"
                  >
                    Close All
                  </button>
                </div>

                {/* Maps Grid - Clean Cards */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                  {mapPanelMaps.map((map, index) => (
                    <div
                      key={map.id}
                      className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => setEnlargedMapIndex(index)}
                    >
                      {/* Map Header - Clean */}
                      <div className="bg-gray-50 border-b border-gray-200 p-3 flex justify-between items-start">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-800 mb-1">{map.candidateName}</div>
                          <div className="text-xs text-gray-500 mb-2">→ {map.clientName}</div>
                          <div className="inline-flex items-center px-2 py-1 bg-green-50 border border-green-200 rounded text-xs font-medium text-green-700">
                            {map.commuteDisplay}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMap(map.id);
                          }}
                          className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg w-7 h-7 flex items-center justify-center text-sm transition-colors"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Map Preview - Clean */}
                      <div className="relative h-48 overflow-hidden bg-gray-100">
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
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 hover:opacity-100 transition-opacity bg-black/5">
                          <div className="bg-white px-4 py-2 rounded-lg text-xs font-medium text-gray-700 shadow-sm border border-gray-200">
                            Click to enlarge
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
