"use client";
import React, { useState, useEffect, useRef } from 'react';

export default function AdminPortal() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Dashboard State
  const [files, setFiles] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if already logged in when the page loads
  useEffect(() => {
    const token = sessionStorage.getItem('adminToken');
    if (token) {
      setIsAuthenticated(true);
      fetchFiles();
    }
  }, []);

  // --- 1. Login Logic ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      const res = await fetch('http://localhost:8000/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem('adminToken', data.token); // Save token securely in browser
        setIsAuthenticated(true);
        fetchFiles(); // Load the files instantly
      } else {
        setLoginError('Invalid username or password');
      }
    } catch (error) {
      setLoginError('Server error. Is the backend running?');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminToken');
    setIsAuthenticated(false);
    setFiles([]);
  };

  // --- 2. Fetch Files Logic ---
  const fetchFiles = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/admin/files');
      const data = await res.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error("Failed to fetch files");
    }
  };

  // --- 3. Upload Logic ---
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileInputRef.current?.files?.[0]) {
      setUploadStatus('Please select a file first.');
      return;
    }

    setIsUploading(true);
    setUploadStatus('Uploading and processing chunks... This may take a minute.');

    const formData = new FormData();
    formData.append('file', fileInputRef.current.files[0]);

    try {
      const res = await fetch('http://localhost:8000/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setUploadStatus(`✅ Success: ${data.message}`);
        fileInputRef.current.value = ''; // Clear the input
        fetchFiles(); // Refresh the file list automatically!
      } else {
        setUploadStatus(`❌ Error: ${data.detail}`);
      }
    } catch (error) {
      setUploadStatus('❌ Server error during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  // --- 4. Delete Logic ---
  const handleDelete = async (filename: string) => {
    // Add a simple confirmation popup so they don't delete by accident
    if (!window.confirm(`Are you sure you want to delete ${filename} and update the AI's memory?`)) return;

    setUploadStatus(`Deleting ${filename} and rebuilding knowledge base...`);
    setIsUploading(true); // Re-use the uploading state to disable buttons during the rebuild

    try {
      const res = await fetch(`http://localhost:8000/api/admin/files/${filename}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (res.ok) {
        setUploadStatus(`✅ ${data.message}`);
        fetchFiles(); // Refresh the visual list!
      } else {
        setUploadStatus(`❌ Error: ${data.detail}`);
      }
    } catch (error) {
      setUploadStatus('❌ Server error during deletion.');
    } finally {
      setIsUploading(false);
    }
  };

  // --- Render: Login Screen ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md border border-gray-200">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Admin Login</h2>
          {loginError && <div className="mb-4 text-sm text-red-600 bg-red-50 p-2 rounded">{loginError}</div>}
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 text-black"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 text-black"
                required
              />
            </div>
            <button 
              type="submit" 
              className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 transition font-medium"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Render: Admin Dashboard ---
  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800">Knowledge Base Dashboard</h1>
          <button onClick={handleLogout} className="text-sm text-red-600 hover:underline">Logout</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Upload Form */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 h-fit">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Upload Official Document</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <input 
                type="file" 
                accept=".pdf"
                ref={fileInputRef}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
              />
              <button 
                type="submit" 
                disabled={isUploading}
                className={`w-full text-white p-2 rounded transition font-medium ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isUploading ? 'Processing...' : 'Upload & Process Vector Embeddings'}
              </button>
            </form>
            {uploadStatus && (
              <div className="mt-4 p-3 rounded bg-gray-50 border border-gray-200 text-sm text-gray-700 whitespace-pre-wrap">
                {uploadStatus}
              </div>
            )}
          </div>

          {/* Right Column: File List */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Active Documents</h2>
            {files.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No documents currently loaded in the system.</p>
            ) : (
              <ul className="space-y-2">
                {files.map((file, index) => (
                  <li key={index} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
                    <div className="flex items-center">
                      <span className="mr-2">📄</span> {file}
                    </div>
                    {/* NEW: The Delete Button */}
                    <button 
                      onClick={() => handleDelete(file)}
                      disabled={isUploading}
                      className="text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded hover:bg-red-50 transition"
                      title="Delete document"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}