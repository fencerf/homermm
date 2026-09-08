import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Folder, File, ChevronRight, X, Home, RotateCcw, Download, Upload } from 'lucide-react';

const FileManagerModal = ({ machineId, onClose }) => {
    const [currentPath, setCurrentPath] = useState("");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [connecting, setConnecting] = useState(true);
    const [error, setError] = useState("");
    const [progress, setProgress] = useState(null); // For tracking chunk progress

    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const isUnmountedRef = useRef(false);

    // State for chunked download
    const downloadStateRef = useRef({ active: false, chunks: [], totalChunks: 0, filename: '' });

    const connectWebSocket = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const token = localStorage.getItem('token');
        const wsUrl = `${protocol}//${host}/api/frontend/machines/${machineId}/ws?token=${token}`;

        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
            console.log("WebSocket connected");
            axios.post(`/api/frontend/machines/${machineId}/tasks`, {
                task_type: "start_filebrowser_ws",
                payload: "{}"
            }).then(() => {
                 setTimeout(() => {
                     setConnecting(false);
                     loadDirectory("");
                 }, 8000);
            });
        };

        wsRef.current.onmessage = async (event) => {
            if (isUnmountedRef.current) return;
            const data = JSON.parse(event.data);

            if (data.type === "directory_list") {
                setCurrentPath(data.path);
                setItems(data.items);
                setLoading(false);
                setError("");
            } else if (data.type === "error") {
                setError(data.message);
                setLoading(false);
            } else if (data.type === "file_download_start") {
                downloadStateRef.current = {
                    active: true,
                    chunks: [], // We will store Blob objects here to avoid OOM
                    totalChunks: data.total_chunks,
                    filename: data.filename
                };
                setProgress(`Downloading: 0%`);

                // Handle 0 byte files immediately
                if (data.total_chunks === 0) {
                    const blob = new Blob([]);
                    triggerDownload(blob, data.filename);
                }

            } else if (data.type === "file_download_chunk") {
                if (downloadStateRef.current.active) {
                    // Convert base64 to binary and store as Blob immediately to save memory
                    const binary = atob(data.content);
                    const array = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        array[i] = binary.charCodeAt(i);
                    }
                    downloadStateRef.current.chunks.push(new Blob([array]));

                    const p = Math.round((downloadStateRef.current.chunks.length / downloadStateRef.current.totalChunks) * 100);
                    setProgress(`Downloading: ${p}%`);

                    if (downloadStateRef.current.chunks.length === downloadStateRef.current.totalChunks) {
                        // Combine all chunks into final Blob
                        const finalBlob = new Blob(downloadStateRef.current.chunks);
                        triggerDownload(finalBlob, downloadStateRef.current.filename);
                    }
                }
            } else if (data.type === "file_download_error") {
                setError(`Download failed: ${data.error}`);
                setLoading(false);
                setProgress(null);
                downloadStateRef.current.active = false;
            } else if (data.type === "file_upload_result") {
                setLoading(false);
                setProgress(null);
                loadDirectory(currentPath); // Refresh
            } else if (data.type === "file_upload_error") {
                setError(`Upload failed: ${data.error}`);
                setLoading(false);
                setProgress(null);
            }
        };

        wsRef.current.onerror = (err) => {
            console.error("WebSocket error", err);
            setError("WebSocket error occurred.");
        };

        wsRef.current.onclose = () => {
            if (!isUnmountedRef.current) {
                console.log("WebSocket disconnected. Reconnecting in 5s...");
                reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
            }
        };
    };

    const triggerDownload = (blob, filename) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setLoading(false);
        setProgress(null);
        downloadStateRef.current.active = false;
        // Clean up memory
        downloadStateRef.current.chunks = [];
    };

    const loadDirectory = (path) => {
        setLoading(true);
        setError("");
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "list_directory", path, req_id: Date.now().toString() }));
        } else {
             setError("WebSocket not connected.");
             setLoading(false);
        }
    };

    useEffect(() => {
        connectWebSocket();
        return () => {
            isUnmountedRef.current = true;
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, [machineId]);

    const navigateTo = (path) => {
        loadDirectory(path);
    };

    const navigateUp = () => {
        if (!currentPath) return;
        let parentPath = currentPath.replace(/\\/g, '/');
        if (parentPath.endsWith('/')) parentPath = parentPath.slice(0, -1);

        const lastSlash = parentPath.lastIndexOf('/');
        if (lastSlash === -1 || (lastSlash === 0 && currentPath.length === 1)) {
             navigateTo("");
        } else {
             let up = currentPath.slice(0, lastSlash);
             if (up.endsWith(':')) up += '\\';
             if (up === "") up = "/";
             navigateTo(up);
        }
    };

    const handleDownload = (path) => {
        setLoading(true);
        setError("");
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "file_download", path, req_id: Date.now().toString() }));
        }
    };

    const handleUploadClick = () => {
        document.getElementById('file-upload-input').click();
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        setError("");

        const separator = currentPath.includes('\\') || currentPath.endsWith(':') ? '\\' : '/';
        let targetPath = currentPath;
        if (!targetPath.endsWith(separator) && targetPath !== "") {
            targetPath += separator;
        }
        targetPath += file.name;

        // Chunking upload
        const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // Handle 0 byte file
            if (file.size === 0) {
                wsRef.current.send(JSON.stringify({
                    type: "file_upload_start",
                    path: targetPath,
                    total_chunks: 0,
                    req_id: Date.now().toString()
                }));
                wsRef.current.send(JSON.stringify({
                    type: "file_upload_finish",
                    path: targetPath,
                    req_id: Date.now().toString()
                }));
                return;
            }

            wsRef.current.send(JSON.stringify({
                type: "file_upload_start",
                path: targetPath,
                total_chunks: totalChunks,
                req_id: Date.now().toString()
            }));

            let chunkIndex = 0;

            const readNextChunk = () => {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const blob = file.slice(start, end);

                const reader = new FileReader();
                reader.onload = (event) => {
                    const arrayBuffer = event.target.result;
                    const uint8Array = new Uint8Array(arrayBuffer);
                    let binary = '';
                    for (let i = 0; i < uint8Array.byteLength; i++) {
                        binary += String.fromCharCode(uint8Array[i]);
                    }
                    const base64Content = btoa(binary);

                    wsRef.current.send(JSON.stringify({
                        type: "file_upload_chunk",
                        path: targetPath,
                        chunk_index: chunkIndex,
                        content: base64Content,
                        req_id: Date.now().toString()
                    }));

                    chunkIndex++;
                    const p = Math.round((chunkIndex / totalChunks) * 100);
                    setProgress(`Uploading: ${p}%`);

                    if (chunkIndex < totalChunks) {
                        // Short delay to avoid overwhelming the websocket
                        setTimeout(readNextChunk, 50);
                    } else {
                        wsRef.current.send(JSON.stringify({
                            type: "file_upload_finish",
                            path: targetPath,
                            req_id: Date.now().toString()
                        }));
                    }
                };
                reader.readAsArrayBuffer(blob);
            };

            readNextChunk();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-lg font-bold text-gray-800">Browse Remote Filesystem</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex items-center p-3 bg-gray-50 border-b space-x-2">
                    <button onClick={() => navigateTo("")} className="p-1 hover:bg-gray-200 rounded text-gray-600" title="Go to Root">
                        <Home size={18} />
                    </button>
                    <button onClick={navigateUp} disabled={!currentPath || loading} className="p-1 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-50" title="Up one level">
                        <ChevronRight size={18} className="transform rotate-180" />
                    </button>
                    <button onClick={() => navigateTo(currentPath)} disabled={loading} className="p-1 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-50" title="Refresh">
                        <RotateCcw size={16} />
                    </button>

                    <div className="flex-grow flex items-center px-3 py-1 bg-white border rounded text-sm text-gray-700 truncate">
                        {currentPath || "Root Drives"}
                    </div>

                    <input type="file" id="file-upload-input" className="hidden" onChange={handleFileUpload} />
                    <button
                        onClick={handleUploadClick}
                        disabled={!currentPath || loading}
                        className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center"
                        title="Upload file to current directory"
                    >
                        <Upload size={16} className="mr-1" /> Upload
                    </button>
                </div>

                {/* Progress Bar */}
                {progress && (
                    <div className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium border-b border-blue-100 flex items-center justify-center">
                        <RotateCcw className="animate-spin mr-2" size={16} /> {progress}
                    </div>
                )}

                {/* Content */}
                <div className="flex-grow overflow-auto p-2">
                    {connecting ? (
                        <div className="flex flex-col justify-center items-center h-40 text-gray-500">
                            <RotateCcw className="animate-spin mb-4" size={32} />
                            <p className="font-semibold text-gray-700">Waking up remote agent...</p>
                            <p className="text-xs text-gray-400 mt-2 text-center max-w-sm">This may take up to 10 seconds while the agent establishes a secure interactive tunnel.</p>
                        </div>
                    ) : (loading && !progress) ? (
                        <div className="flex justify-center items-center h-32 text-gray-500">
                            <RotateCcw className="animate-spin mr-2" size={20} /> Loading directory...
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded m-2">
                            {error}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 italic">Empty directory</div>
                    ) : (
                        <ul className="space-y-1">
                            {items.map((item, idx) => (
                                <li key={idx}>
                                    <div className="flex items-center w-full px-3 py-2 hover:bg-gray-100 rounded">
                                        <button
                                            disabled={loading}
                                            onClick={() => item.is_dir && navigateTo(item.path)}
                                            className={`flex items-center flex-grow text-left ${!item.is_dir || loading ? 'cursor-default opacity-70' : ''}`}
                                        >
                                            {item.is_dir ? (
                                                <Folder size={18} className="text-blue-400 mr-3" />
                                            ) : (
                                                <File size={18} className="text-gray-400 mr-3" />
                                            )}
                                            <span className="text-sm text-gray-700 truncate">{item.name}</span>
                                        </button>
                                        {!item.is_dir && (
                                            <button
                                                disabled={loading}
                                                onClick={() => handleDownload(item.path)}
                                                className="p-1 text-gray-500 hover:text-blue-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Download file"
                                            >
                                                <Download size={16} />
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

            </div>
        </div>
    );
};

export default FileManagerModal;
