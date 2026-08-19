import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Folder, File, ChevronRight, X, Home, RotateCcw } from 'lucide-react';

const RemoteFileBrowser = ({ machineId, onSelectPath, onClose }) => {
    const [currentPath, setCurrentPath] = useState("");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const pollIntervalRef = useRef(null);

    const loadDirectory = async (path) => {
        setLoading(true);
        setError("");
        setItems([]);

        try {
            // 1. Create task
            const taskRes = await axios.post(`/api/frontend/machines/${machineId}/tasks`, {
                task_type: "list_directory",
                payload: JSON.stringify({ path: path })
            });
            const taskId = taskRes.data.id;

            // 2. Poll for completion
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const statusRes = await axios.get(`/api/frontend/machines/${machineId}/tasks/${taskId}`);
                    if (statusRes.data.status === "completed") {
                        clearInterval(pollIntervalRef.current);
                        const result = JSON.parse(statusRes.data.result_message);
                        setCurrentPath(result.current_path || "");
                        setItems(result.items);
                        setLoading(false);
                    } else if (statusRes.data.status === "failed") {
                        clearInterval(pollIntervalRef.current);
                        setError(statusRes.data.result_message || "Failed to load directory.");
                        setLoading(false);
                    }
                } catch (pollErr) {
                    console.error("Poll error:", pollErr);
                }
            }, 1000); // Poll every 1 second

        } catch (err) {
            console.error("Request error:", err);
            setError("Failed to request directory listing.");
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDirectory(""); // Load root
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [machineId]);

    const navigateTo = (path) => {
        loadDirectory(path);
    };

    const navigateUp = () => {
        if (!currentPath) return;
        // Basic up navigation (handles both Linux / and Windows C:\)
        let parentPath = currentPath.replace(/\\/g, '/');
        if (parentPath.endsWith('/')) parentPath = parentPath.slice(0, -1);

        const lastSlash = parentPath.lastIndexOf('/');
        if (lastSlash === -1 || (lastSlash === 0 && currentPath.length === 1)) {
             // We are at root, or going to root
             navigateTo("");
        } else {
             // For Windows root like C:, slice doesn't work perfectly if we strip the slash, so we add it back if needed
             let up = currentPath.slice(0, lastSlash);
             if (up.endsWith(':')) up += '\\';
             if (up === "") up = "/";
             navigateTo(up);
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
                    <button onClick={navigateUp} disabled={!currentPath} className="p-1 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-50" title="Up one level">
                        <ChevronRight size={18} className="transform rotate-180" />
                    </button>
                    <button onClick={() => navigateTo(currentPath)} className="p-1 hover:bg-gray-200 rounded text-gray-600" title="Refresh">
                        <RotateCcw size={16} />
                    </button>

                    <div className="flex-grow flex items-center px-3 py-1 bg-white border rounded text-sm text-gray-700 truncate">
                        {currentPath || "Root Drives"}
                    </div>

                    <button
                        onClick={() => onSelectPath(currentPath)}
                        disabled={!currentPath || loading}
                        className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                    >
                        Select Folder
                    </button>
                </div>

                {/* Content */}
                <div className="flex-grow overflow-auto p-2">
                    {loading ? (
                        <div className="flex justify-center items-center h-32 text-gray-500">
                            <RotateCcw className="animate-spin mr-2" size={20} /> Loading from agent...
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
                                    <button
                                        onClick={() => item.is_dir && navigateTo(item.path)}
                                        className={`flex items-center w-full px-3 py-2 text-left rounded hover:bg-gray-100 ${!item.is_dir ? 'cursor-default opacity-70' : ''}`}
                                    >
                                        {item.is_dir ? (
                                            <Folder size={18} className="text-blue-400 mr-3" />
                                        ) : (
                                            <File size={18} className="text-gray-400 mr-3" />
                                        )}
                                        <span className="text-sm text-gray-700 truncate">{item.name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

            </div>
        </div>
    );
};

export default RemoteFileBrowser;
