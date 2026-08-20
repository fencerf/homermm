import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, RefreshCw, Terminal, Activity, Filter, Search } from 'lucide-react';
import { formatTime } from '../utils/timezone';

const MachineLogsModal = ({ machineId, onClose }) => {
    const [activeTab, setActiveTab] = useState('actions'); // 'actions', 'agent' or 'audit'
    const [logs, setLogs] = useState([]);
    const [actionsData, setActionsData] = useState([]);
    const [dbSizeKb, setDbSizeKb] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Filters
    const [logLevelFilter, setLogLevelFilter] = useState("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const [timeRange, setTimeRange] = useState("ALL"); // ALL, 1H, 24H, 7D
    const [expandedActions, setExpandedActions] = useState({});

    const fetchLogs = async () => {
        setLoading(true);
        setError("");
        try {
            const sizeResponse = await axios.get(`/api/frontend/machines/${machineId}/logs/size`);
            setDbSizeKb(sizeResponse.data.size_kb);

            if (activeTab === 'actions') {
                const response = await axios.get(`/api/frontend/machines/${machineId}/actions`);
                setActionsData(response.data);
            } else {
                const response = await axios.get(`/api/frontend/machines/${machineId}/logs/${activeTab}`);
                setLogs(response.data);
            }
        } catch (err) {
            setError(`Failed to fetch ${activeTab} data.`);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const toggleActionDetails = (actionId) => {
         setExpandedActions(prev => ({...prev, [actionId]: !prev[actionId]}));
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

    const filteredLogs = logs.filter(log => {
        if (activeTab === 'agent' && logLevelFilter !== 'ALL' && log.level !== logLevelFilter) return false;

        if (timeRange !== 'ALL' && log.timestamp) {
            const logTime = new Date(log.timestamp.endsWith('Z') ? log.timestamp : log.timestamp + 'Z').getTime();
            const now = new Date().getTime();
            const diffHours = (now - logTime) / (1000 * 60 * 60);

            if (timeRange === '1H' && diffHours > 1) return false;
            if (timeRange === '24H' && diffHours > 24) return false;
            if (timeRange === '7D' && diffHours > 168) return false;
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const messageMatch = log.message?.toLowerCase().includes(query) || log.details?.toLowerCase().includes(query) || log.action?.toLowerCase().includes(query);
            return messageMatch;
        }
        return true;
    });

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
                            onClick={() => setActiveTab('actions')}
                            className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${activeTab === 'actions' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
                        >
                            <Activity size={16} className="mr-2" /> User Actions
                        </button>
                        <button
                            onClick={() => setActiveTab('agent')}
                            className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${activeTab === 'agent' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
                        >
                            <Terminal size={16} className="mr-2" /> Raw Agent Logs
                        </button>
                        <button
                            onClick={() => setActiveTab('audit')}
                            className={`px-4 py-2 text-sm font-medium rounded-md flex items-center ${activeTab === 'audit' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}
                        >
                            <Activity size={16} className="mr-2" /> Raw Audit Logs
                        </button>
                    </div>

                    <div className="flex items-center space-x-4">
                        {(activeTab === 'agent' || activeTab === 'audit') && (
                            <div className="flex items-center space-x-2">
                                <select
                                    className="text-sm border-gray-300 rounded-md focus:ring-blue-500 py-1 pl-2 pr-6"
                                    value={timeRange}
                                    onChange={(e) => setTimeRange(e.target.value)}
                                >
                                    <option value="ALL">All Time</option>
                                    <option value="1H">Last 1 Hour</option>
                                    <option value="24H">Last 24 Hours</option>
                                    <option value="7D">Last 7 Days</option>
                                </select>
                                {activeTab === 'agent' && (
                                    <select
                                        className="text-sm border-gray-300 rounded-md focus:ring-blue-500 py-1 pl-2 pr-6"
                                        value={logLevelFilter}
                                        onChange={(e) => setLogLevelFilter(e.target.value)}
                                    >
                                        <option value="ALL">All Levels</option>
                                        <option value="INFO">INFO</option>
                                        <option value="WARNING">WARNING</option>
                                        <option value="ERROR">ERROR</option>
                                        <option value="DEBUG">DEBUG</option>
                                    </select>
                                )}
                                <div className="relative">
                                    <Search size={14} className="absolute left-2 top-2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="text-sm border-gray-300 rounded-md focus:ring-blue-500 py-1 pl-7 pr-2 w-48"
                                    />
                                </div>
                            </div>
                        )}
                        <button
                            onClick={fetchLogs}
                            disabled={loading}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 border border-gray-200"
                            title="Refresh Logs"
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-grow overflow-auto p-4 bg-gray-900 text-gray-100 font-mono text-xs sm:text-sm">
                    {loading && logs.length === 0 && actionsData.length === 0 ? (
                        <div className="flex justify-center items-center h-32 text-gray-400">
                            <RefreshCw className="animate-spin mr-2" size={20} /> Loading data...
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-900/50 text-red-200 border border-red-800 rounded">
                            {error}
                        </div>
                    ) : activeTab === 'actions' ? (
                        <div className="space-y-4">
                            {actionsData.length === 0 ? (
                                 <div className="text-center text-gray-500 italic">No user actions found.</div>
                            ) : (
                                actionsData.map(action => (
                                    <div key={action.action_id} className="bg-gray-800 rounded border border-gray-700 overflow-hidden">
                                        <div
                                            className="px-4 py-2 bg-gray-700/50 flex justify-between items-center cursor-pointer hover:bg-gray-700 transition-colors"
                                            onClick={() => toggleActionDetails(action.action_id)}
                                        >
                                            <div className="flex items-center space-x-4">
                                                <span className="text-blue-400 font-bold">{action.action}</span>
                                                <span className="text-gray-400">[{formatTime(action.timestamp)}]</span>
                                            </div>
                                            <div className="flex items-center space-x-4 text-xs text-gray-400">
                                                <span>User: {action.user}</span>
                                                <span>{expandedActions[action.action_id] ? '▼' : '▶'}</span>
                                            </div>
                                        </div>

                                        {expandedActions[action.action_id] && (
                                            <div className="p-4 space-y-4">
                                                <div className="text-gray-300">
                                                    <span className="text-gray-500">Details: </span>{action.details}
                                                </div>

                                                {action.tasks && action.tasks.length > 0 && (
                                                    <div className="bg-gray-900 p-3 rounded border border-gray-800">
                                                        <div className="text-gray-500 font-semibold mb-2 uppercase text-[10px] tracking-wider">Related Tasks</div>
                                                        {action.tasks.map(t => (
                                                            <div key={t.id} className="flex space-x-3 mb-1">
                                                                <span className={`font-bold ${t.status === 'completed' ? 'text-green-500' : t.status === 'failed' ? 'text-red-500' : 'text-yellow-500'}`}>[{t.status.toUpperCase()}]</span>
                                                                <span className="text-gray-400">{t.task_type}</span>
                                                                <span className="text-gray-300 break-all">{t.result_message || t.payload}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {action.agent_logs && action.agent_logs.length > 0 && (
                                                    <div className="bg-gray-900 p-3 rounded border border-gray-800">
                                                        <div className="text-gray-500 font-semibold mb-2 uppercase text-[10px] tracking-wider">Agent Log Output</div>
                                                        <div className="space-y-1">
                                                            {action.agent_logs.map((al, idx) => (
                                                                <div key={idx} className="flex space-x-3">
                                                                    <span className="text-gray-500 whitespace-nowrap">[{formatTime(al.timestamp)}]</span>
                                                                    <span className={`font-bold ${getLevelColor(al.level)} px-1 rounded`}>{al.level}</span>
                                                                    <span className="text-gray-300 whitespace-pre-wrap">{al.message}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {(!action.tasks || action.tasks.length === 0) && (!action.agent_logs || action.agent_logs.length === 0) && (
                                                    <div className="text-gray-500 italic text-xs">No tasks or agent logs correlated to this action.</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 italic">No logs found matching filters.</div>
                    ) : (
                        <div className="space-y-1">
                            {activeTab === 'agent' && filteredLogs.map((log) => (
                                <div key={log.id} className="flex space-x-3 py-1 border-b border-gray-800 hover:bg-gray-800 px-2 rounded">
                                    <span className="text-gray-400 whitespace-nowrap">[{formatTime(log.timestamp)}]</span>
                                    <span className={`px-2 rounded text-xs font-bold ${getLevelColor(log.level)}`}>{log.level}</span>
                                    <span className="text-gray-300 flex-grow break-all whitespace-pre-wrap">{log.message}</span>
                                </div>
                            ))}
                            {activeTab === 'audit' && filteredLogs.map((log) => (
                                <div key={log.id} className="flex space-x-3 py-1 border-b border-gray-800 hover:bg-gray-800 px-2 rounded">
                                    <span className="text-gray-400 whitespace-nowrap">[{formatTime(log.timestamp)}]</span>
                                    <span className="text-purple-400 font-bold w-16">{log.user}</span>
                                    <span className="text-blue-300 font-semibold">{log.action}</span>
                                    <span className="text-gray-400 flex-grow">- {log.details}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 bg-gray-50 border-t flex justify-between items-center">
                     <span className={`text-xs ${dbSizeKb > 500 * 1024 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                         Log DB Size on Disk: {(dbSizeKb / 1024).toFixed(2)} MB
                         {dbSizeKb > 500 * 1024 && " (Warning: Log database is exceeding 500MB. Consider lowering retention days.)"}
                     </span>
                     <span className="text-xs text-gray-500">
                         {activeTab === 'actions' ? `Showing last ${actionsData.length} actions.` : `Showing ${filteredLogs.length} entries.`}
                     </span>
                </div>
            </div>
        </div>
    );
};

export default MachineLogsModal;
