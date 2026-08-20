import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, RefreshCw, Terminal, Activity } from 'lucide-react';

const MachineLogsModal = ({ machineId, onClose }) => {
    const [activeTab, setActiveTab] = useState('agent'); // 'agent' or 'audit'
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchLogs = async () => {
        setLoading(true);
        setError("");
        try {
            const response = await axios.get(`/api/frontend/machines/${machineId}/logs/${activeTab}`);
            setLogs(response.data);
        } catch (err) {
            setError(`Failed to fetch ${activeTab} logs.`);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [activeTab, machineId]);

    const getLevelColor = (level) => {
        switch (level?.toUpperCase()) {
            case 'ERROR': return 'text-red-600 bg-red-50';
            case 'WARNING': return 'text-yellow-600 bg-yellow-50';
            case 'INFO': return 'text-blue-600 bg-blue-50';
            case 'DEBUG': return 'text-gray-500 bg-gray-100';
            default: return 'text-gray-700 bg-gray-50';
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                        <Terminal size={20} className="mr-2" /> System Logs
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X size={24} />
                    </button>
                </div>

                {/* Tabs & Controls */}
                <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setActiveTab('agent')}
                            className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${activeTab === 'agent' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
                        >
                            <Terminal size={16} className="mr-2" /> Agent Logs
                        </button>
                        <button
                            onClick={() => setActiveTab('audit')}
                            className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${activeTab === 'audit' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
                        >
                            <Activity size={16} className="mr-2" /> Audit Logs
                        </button>
                    </div>
                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                        title="Refresh Logs"
                    >
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-grow overflow-auto p-4 bg-gray-900 text-gray-100 font-mono text-xs sm:text-sm">
                    {loading && logs.length === 0 ? (
                        <div className="flex justify-center items-center h-32 text-gray-400">
                            <RefreshCw className="animate-spin mr-2" size={20} /> Loading logs...
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-900/50 text-red-200 border border-red-800 rounded">
                            {error}
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 italic">No logs found in the database.</div>
                    ) : (
                        <div className="space-y-1">
                            {activeTab === 'agent' && logs.map((log) => (
                                <div key={log.id} className="flex space-x-3 py-1 border-b border-gray-800 hover:bg-gray-800 px-2 rounded">
                                    <span className="text-gray-400 whitespace-nowrap">[{new Date(log.timestamp).toLocaleString()}]</span>
                                    <span className={`px-2 rounded text-xs font-bold ${getLevelColor(log.level)}`}>{log.level}</span>
                                    <span className="text-gray-300 flex-grow break-all whitespace-pre-wrap">{log.message}</span>
                                </div>
                            ))}
                            {activeTab === 'audit' && logs.map((log) => (
                                <div key={log.id} className="flex space-x-3 py-1 border-b border-gray-800 hover:bg-gray-800 px-2 rounded">
                                    <span className="text-gray-400 whitespace-nowrap">[{new Date(log.timestamp).toLocaleString()}]</span>
                                    <span className="text-purple-400 font-bold w-16">{log.user}</span>
                                    <span className="text-blue-300 font-semibold">{log.action}</span>
                                    <span className="text-gray-400 flex-grow">- {log.details}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 bg-gray-50 border-t flex justify-end">
                     <span className="text-xs text-gray-500">Showing last {logs.length} entries.</span>
                </div>
            </div>
        </div>
    );
};

export default MachineLogsModal;
