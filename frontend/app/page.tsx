"use client";
import React, { useState, useRef, useEffect } from 'react';

// Define the structure of our messages to include optional audio URLs
type Message = {
  role: 'ai' | 'user';
  content: string;
  audioUrl?: string; 
  sources?: string[];
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: 'Hello! How can I help you access public services today?' }
  ]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('en');
  
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Instantly log out admin if they navigate back to the citizen chat
  useEffect(() => {
    sessionStorage.removeItem('adminToken');
    localStorage.removeItem('adminToken'); // Just in case the old one is lingering!
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // --- 1. Handle Text Submission ---
  const handleSendText = async () => {
    if (!input.trim()) return;
    
    const userText = input;
    setInput(''); 
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:8000/api/chat/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userText, language_code: language }),
      });
      const data = await res.json();
      
      // NEW: Check if the backend sent an error code
      if (!res.ok) {
        throw new Error(data.detail || "Server error occurred");
      }
      
      setMessages((prev) => [...prev, { role: 'ai', content: data.response, sources: data.sources }]);
    } catch (error: any) {
      console.error(error);
      setMessages((prev) => [...prev, { role: 'ai', content: `❌ Backend Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- 2. Handle Microphone Recording ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleSendAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Microphone error:", error);
      alert("Please allow microphone permissions to use voice search.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // --- New Toggle Function ---
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // --- 3. Handle Audio Submission ---
  const handleSendAudio = async (audioBlob: Blob) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    
    setMessages((prev) => [...prev, { role: 'user', content: '', audioUrl: audioUrl }]);
    setIsLoading(true);

    const formData = new FormData();
    formData.append('file', audioBlob, 'voice_memo.webm');
    formData.append('language_code', language); 

    try {
      const res = await fetch('http://localhost:8000/api/chat/audio', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      
      // NEW: Check if the backend sent an error code
      if (!res.ok) {
        throw new Error(data.detail || "Server error occurred");
      }
      
      setMessages((prev) => [...prev, { role: 'ai', content: data.response, sources: data.sources }]);
    } catch (error: any) {
      console.error(error);
      setMessages((prev) => [...prev, { role: 'ai', content: `❌ Backend Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- 4. Read Out Loud (Server-Side TTS) ---
  const [isSpeaking, setIsSpeaking] = useState(false); // Add this right below your other useStates!

  const handleReadAloud = async (text: string, langCode: string) => {
    if (isSpeaking) return; // Prevent spam-clicking
    setIsSpeaking(true);

    try {
      const res = await fetch('http://localhost:8000/api/chat/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language_code: langCode }),
      });

      if (!res.ok) throw new Error("TTS failed");

      // Convert the incoming audio stream into a playable blob
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Play it invisibly in the background
      const audio = new Audio(audioUrl);
      
      audio.onended = () => setIsSpeaking(false); // Reset state when finished
      audio.play();

    } catch (error) {
      console.error("TTS Error:", error);
      alert("Sorry, could not generate the audio right now.");
      setIsSpeaking(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans">
      
      {/* Top Header */}
      <header className="bg-green-600 text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold">Inclusive Citizen</h1>
        <select 
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-white text-black p-2 rounded-md shadow-sm outline-none font-medium cursor-pointer"
        >
          <option value="en">English</option>
          <option value="ms">Bahasa Melayu</option>
          <option value="ms-kl">BM - Kelantanese</option>
          <option value="zh">Chinese (Mandarin)</option>
          <option value="ta">Tamil</option>
          <option value="th">Thai</option>
          <option value="vi">Vietnamese</option>
          <option value="id-jv">Indonesian - Javanese</option>
          <option value="tl-cb">Filipino - Cebuano</option>
        </select>
      </header>

      {/* Message Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-lg max-w-sm shadow-sm whitespace-pre-wrap ${
              msg.role === 'user' 
                ? 'bg-green-100 text-gray-800 rounded-tr-none' 
                : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'
            }`}>
              {/* If there is an audio URL, render the audio player; otherwise, render text */}
              {msg.audioUrl ? (
                <audio controls src={msg.audioUrl} className="max-w-[250px]" />
              ) : (
                msg.content
              )}
              {/* NEW: Render the Source Citation Badge */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-md inline-block border border-green-200">
                  📄 Source: {msg.sources.join(', ')}
                </div>
              )}
              {/* NEW: Sources and TTS Button Container */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {msg.sources && msg.sources.length > 0 && (
                  <div className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded-md inline-block border border-green-200">
                    📄 Source: {msg.sources.join(', ')}
                  </div>
                )}
                
                {/* Only show the Read Out Loud button for AI text messages */}
                {msg.role === 'ai' && (
                  <button 
                    onClick={() => handleReadAloud(msg.content, language)}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-md border border-gray-300 transition flex items-center"
                    title="Read this response out loud"
                  >
                    🔊 Listen
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-500 p-3 rounded-lg rounded-tl-none shadow-sm animate-pulse border border-gray-200">
              Processing...
            </div>
          </div>
        )}
      </main>

      {/* Bottom Input Bar */}
      <footer className="bg-gray-200 p-3 flex items-center space-x-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
          placeholder="Type a question..." 
          // Explicitly set text color to gray-800 and background to white
          className="flex-1 p-3 rounded-full outline-none shadow-sm bg-white text-gray-800 placeholder-gray-400"
          disabled={isLoading || isRecording}
        />
        
        {/* Dynamic Voice Toggle Button */}
        <button 
          onClick={toggleRecording}
          className={`${isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-600'} text-white p-3 rounded-full transition w-12 h-12 flex items-center justify-center shadow-sm`}
          title={isRecording ? "Click to stop and send" : "Click to start recording"}
        >
          {isRecording ? '⏹️' : '🎙️'}
        </button>

        <button 
          onClick={handleSendText}
          className="bg-blue-500 text-white p-3 rounded-full hover:bg-blue-600 transition w-12 h-12 flex items-center justify-center"
        >
          ➤
        </button>
      </footer>

    </div>
  );
}