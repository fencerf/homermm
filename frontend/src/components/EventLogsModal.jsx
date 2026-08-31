import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, RefreshCw, AlertTriangle, AlertCircle } from 'lucide-react';
import { formatTime } from '../utils/timezone';
import { generateUUID } from '../utils/uuid';

const EventLogsModal = ({ machineId, onClose }) => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [actionMessage, setActionMessage] = useState("");

    const loadStoredEvents = async () => {
        try {
            const res = await axios.get(`/api/frontend/machines/${machineId}/logs/events`);
            setEvents(res.data);
        } catch (e) {
            console.error("Failed to load stored events", e);
            setError("Failed to load stored events.");
        }
    };

    const fetchEvents = async () => {
        setLoading(true);
        setError("");
        setActionMessage("Requesting event logs from agent (last 5 days, warnings/errors)...");
        try {
            const actionId = generateUUID();
            const createRes = await axios.post(`/api/frontend/machines/${machineId}/tasks`, {
                task_type: "fetch_event_logs",
                payload: "{}",
                action_id: actionId
            });
            const taskId = createRes.data.id;

            const pollInterval = setInterval(async () => {
                try {
                    const taskRes = await axios.get(`/api/frontend/machines/${machineId}/tasks/${taskId}`);
                    const task = taskRes.data;

                    if (task.status === "completed") {
                        clearInterval(pollInterval);
                        // Once completed, agent stored the logs in the DB, so we just reload from DB
                        await loadStoredEvents();
                        setLoading(false);
                        setActionMessage("");
                    } else if (task.status === "failed") {
                        clearInterval(pollInterval);
                        setError(`Failed to fetch logs: ${task.result_message}`);
                        setLoading(false);
                        setActionMessage("");
                    }
                } catch (e) {
                    console.error("Error polling task", e);
                }
            }, 1000);

            // Timeout safety
            setTimeout(() => {
                clearInterval(pollInterval);
                if (loading) {
                    setLoading(false);
                    setError("Timeout waiting for event logs from agent.");
                    setActionMessage("");
                }
            }, 30000); // Give it a bit longer since fetching 5 days might take a few seconds

        } catch (err) {
            console.error("Error starting fetch_event_logs task:", err);
            setError("Error requesting event logs.");
            setLoading(false);
            setActionMessage("");
        }
    };

    useEffect(() => {
        // Load initial events from DB instead of triggering a refresh right away
        loadStoredEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [machineId]);

    const getRowStyle = (level) => {
        const lowerLevel = (level || "").toLowerCase();
        if (lowerLevel.includes('error')) return 'bg-red-900/20 hover:bg-red-900/40 text-red-100';
        if (lowerLevel.includes('warning') || lowerLevel.includes('warn')) return 'bg-yellow-900/20 hover:bg-yellow-900/40 text-yellow-100';
        return 'hover:bg-gray-800 text-gray-200';
    };

    const getIcon = (level) => {
        const lowerLevel = (level || "").toLowerCase();
        if (lowerLevel.includes('error')) return <AlertCircle size={16} className="text-red-500 mr-2 flex-shrink-0" />;
        if (lowerLevel.includes('warning') || lowerLevel.includes('warn')) return <AlertTriangle size={16} className="text-yellow-500 mr-2 flex-shrink-0" />;
        return null;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[85vh] border border-gray-700">

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-800">
                    <div className="flex items-center text-white">
                        <AlertTriangle className="mr-2 text-yellow-500" size={20} />
                        <h3 className="font-semibold text-lg">System Event Logs (Last 5 Days)</h3>
                    </div>
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={fetchEvents}
                            disabled={loading}
                            className="p-2 text-gray-400 hover:text-white rounded transition-colors disabled:opacity-50"
                            title="Refresh Logs"
                        >
                            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <X size={24}/>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-grow overflow-auto bg-gray-950 font-mono text-sm relative">
                    {loading && events.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col justify-center items-center text-gray-400 bg-gray-950/80 z-10">
                            <RefreshCw className="animate-spin mb-4" size={32} />
                            <p>{actionMessage}</p>
                        </div>
                    ) : null}

                    {error && (
                        <div className="m-4 p-4 bg-red-900/50 text-red-200 border border-red-800 rounded">
                            {error}
                        </div>
                    )}

                    {!loading && !error && events.length === 0 ? (
                        <div className="flex justify-center items-center h-full text-gray-500 italic">
                            No warnings or errors found in the last 5 days.
                        </div>
                    ) : (
                        <div className="min-w-max">
                             <div className="sticky top-0 bg-gray-800 border-b border-gray-700 text-gray-300 font-semibold px-4 py-2 flex text-xs uppercase tracking-wider z-10">
                                <div className="w-48 flex-shrink-0">Timestamp</div>
                                <div className="w-32 flex-shrink-0">Level</div>
                                <div className="w-48 flex-shrink-0">Source</div>
                                <div className="flex-grow">Message</div>
                            </div>
                            <div className="divide-y divide-gray-800">
                                {events.map((ev, idx) => (
                                    <div key={idx} className={`px-4 py-3 flex ${getRowStyle(ev.level)} transition-colors`}>
                                        <div className="w-48 flex-shrink-0 text-gray-400">
                                            {ev.timestamp ? formatTime(ev.timestamp) : 'N/A'}
                                        </div>
                                        <div className="w-32 flex-shrink-0 flex items-center font-bold">
                                            {getIcon(ev.level)}
                                            {ev.level}
                                        </div>
                                        <div className="w-48 flex-shrink-0 break-all pr-4">
                                            {ev.source}
                                        </div>
                                        <div className="flex-grow whitespace-pre-wrap break-words pr-2 max-w-[800px]">
                                            {ev.message}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 bg-gray-800 border-t border-gray-700 flex justify-between items-center text-gray-400 text-xs">
                     <span>Filtered for Warnings and Errors only.</span>
                     <span>Total entries: {events.length}</span>
                </div>
            </div>
        </div>
    );
};

export default EventLogsModal;
