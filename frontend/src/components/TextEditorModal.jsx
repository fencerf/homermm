import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Save, RefreshCw } from 'lucide-react';
import { generateUUID } from '../utils/uuid';

function TextEditorModal({ machineId, filePath, onClose }) {
    const [content, setContent] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [actionMessage, setActionMessage] = useState("");

    const fetchFileContent = async () => {
        setIsLoading(true);
        setActionMessage("");
        try {
            // First we issue the read_file task
            const taskId = generateUUID();
            await axios.post(`/api/frontend/machines/${machineId}/tasks`, {
                task_type: "read_file",
                payload: JSON.stringify({ path: filePath }),
                action_id: taskId
            });

            // Now we poll for the result
            const pollInterval = setInterval(async () => {
                try {
                    const taskRes = await axios.get(`/api/frontend/machines/${machineId}/tasks/${taskId}`);
                    const task = taskRes.data;

                    if (task.status === "completed") {
                        clearInterval(pollInterval);
                        try {
                            const resultData = JSON.parse(task.result_message);
                            setContent(resultData.content || "");
                        } catch (e) {
                            setContent("");
                        }
                        setIsLoading(false);
                    } else if (task.status === "failed") {
                        clearInterval(pollInterval);
                        setActionMessage(`Failed to read file: ${task.result_message}`);
                        setIsLoading(false);
                    }
                } catch (e) {
                    console.error("Error polling task", e);
                }
            }, 1000);

            // Timeout safety
            setTimeout(() => {
                clearInterval(pollInterval);
                if (isLoading) {
                    setIsLoading(false);
                    setActionMessage("Timeout waiting for file content from agent.");
                }
            }, 15000);

        } catch (error) {
            console.error("Failed to fetch file content", error);
            setActionMessage("Error requesting file content.");
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFileContent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [machineId, filePath]);

    const handleSave = async () => {
        setIsSaving(true);
        setActionMessage("");
        try {
            const taskId = generateUUID();
            await axios.post(`/api/frontend/machines/${machineId}/tasks`, {
                task_type: "write_file",
                payload: JSON.stringify({
                    path: filePath,
                    content: content
                }),
                action_id: taskId
            });

            // Poll for write completion
            const pollInterval = setInterval(async () => {
                try {
                    const taskRes = await axios.get(`/api/frontend/machines/${machineId}/tasks/${taskId}`);
                    const task = taskRes.data;

                    if (task.status === "completed") {
                        clearInterval(pollInterval);
                        setActionMessage("File saved successfully!");
                        setIsSaving(false);
                        setTimeout(() => {
                            onClose(false); // Close after a brief success message
                        }, 1500);
                    } else if (task.status === "failed") {
                        clearInterval(pollInterval);
                        setActionMessage(`Failed to save file: ${task.result_message}`);
                        setIsSaving(false);
                    }
                } catch (e) {
                    console.error("Error polling task", e);
                }
            }, 1000);

        } catch (error) {
            console.error("Failed to save file", error);
            setActionMessage("Error queuing file save.");
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                    <h3 className="font-semibold text-lg text-gray-800 break-all pr-4">Edit File: {filePath}</h3>
                    <button onClick={() => onClose(false)} className="text-gray-500 hover:text-gray-800 flex-shrink-0"><X size={20}/></button>
                </div>

                <div className="p-4 flex-grow flex flex-col min-h-0">
                    {actionMessage && (
                        <div className={`mb-4 p-3 rounded ${actionMessage.includes("Error") || actionMessage.includes("Timeout") || actionMessage.includes("Failed") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {actionMessage}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex-grow flex items-center justify-center text-gray-500">
                            <RefreshCw className="animate-spin mr-2" size={24} />
                            Fetching from agent...
                        </div>
                    ) : (
                        <textarea
                            className="w-full flex-grow border rounded p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Enter file contents here..."
                            spellCheck="false"
                        />
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end space-x-3 items-center">
                    <button onClick={() => onClose(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isLoading}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded flex items-center disabled:opacity-50 transition-colors"
                    >
                        {isSaving ? <RefreshCw size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
                        {isSaving ? 'Saving...' : 'Save File'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default TextEditorModal;
