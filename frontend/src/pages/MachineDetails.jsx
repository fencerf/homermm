import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Cpu, HardDrive, Database, RefreshCw, Archive, FolderSearch, Terminal, List, Clock, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import RemoteFileBrowser from '../components/RemoteFileBrowser';
import MachineLogsModal from '../components/MachineLogsModal';
import EventLogsModal from '../components/EventLogsModal';
import KopiaPolicyModal from '../components/KopiaPolicyModal';
import TextEditorModal from '../components/TextEditorModal';
import { formatTime, fetchServerTimezone } from '../utils/timezone';
import { generateUUID } from '../utils/uuid';


const TaskFolder = ({ node, onRun, onDelete, disabled, level = 0 }) => {
    // Only open the root node by default
    const [isOpen, setIsOpen] = useState(level === 0);

    // Calculate total tasks in this subtree for the badge
    const countTasks = (n) => {
        let count = n.tasks ? n.tasks.length : 0;
        if (n.children) {
            Object.values(n.children).forEach(child => count += countTasks(child));
        }
        return count;
    };
    const totalTasks = countTasks(node);

    return (
        <div className={`border-l border-gray-200 ${level === 0 ? 'border border-gray-200 mb-2 rounded overflow-hidden' : 'pl-4'}`}>
            <div
                className={`px-4 py-2 flex items-center cursor-pointer hover:bg-gray-100 transition-colors ${level === 0 ? 'bg-gray-100 py-3' : 'bg-white'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                {isOpen ? <ChevronDown size={18} className="mr-2 text-gray-600" /> : <ChevronRight size={18} className="mr-2 text-gray-600" />}
                <Folder size={18} className="mr-2 text-blue-500" />
                <span className={`font-semibold text-gray-800 ${level === 0 ? 'text-sm' : 'text-xs'}`}>{node.name}</span>
                {totalTasks > 0 && (
                    <span className="ml-auto text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{totalTasks} tasks</span>
                )}
            </div>
            {isOpen && (
                <div className="bg-white">
                    {/* Render child folders recursively */}
                    {node.children && Object.keys(node.children).sort().map(childName => (
                        <TaskFolder
                            key={childName}
                            node={node.children[childName]}
                            onRun={onRun}
                            onDelete={onDelete}
                            disabled={disabled}
                            level={level + 1}
                        />
                    ))}

                    {/* Render tasks in this specific folder */}
                    {node.tasks && node.tasks.length > 0 && (
                        <div className="overflow-x-auto pl-8 pr-4 py-2">
                            <table className="min-w-full text-left text-xs whitespace-nowrap">
                                <thead className="uppercase tracking-wider border-b border-gray-200 text-gray-500">
                                    <tr>
                                        <th className="px-2 py-1 font-medium w-1/3">Task Name</th>
                                        <th className="px-2 py-1 font-medium w-1/4">Schedule</th>
                                        <th className="px-2 py-1 font-medium w-1/4">Command</th>
                                        <th className="px-2 py-1 font-medium w-1/6">Controls</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {node.tasks.map((task, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="px-2 py-1 font-medium text-gray-900">{task.shortName}</td>
                                            <td className="px-2 py-1 text-gray-600">{task.schedule}</td>
                                            <td className="px-2 py-1 text-gray-500 font-mono truncate max-w-[200px]" title={task.command}>{task.command}</td>
                                            <td className="px-2 py-1 space-x-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onRun(task.task_name); }}
                                                    disabled={disabled}
                                                    className="text-blue-600 hover:text-blue-900 px-2 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50"
                                                >
                                                    Run
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDelete(task.task_name); }}
                                                    disabled={disabled}
                                                    className="text-red-600 hover:text-red-900 px-2 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                                                >
                                                    Del
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

function MachineDetails() {

    const { id } = useParams();
    const [machine, setMachine] = useState(null);
    const [updates, setUpdates] = useState([]);
    const [kopiaPaths, setKopiaPaths] = useState("");
    const [installPackageId, setInstallPackageId] = useState("");
    const [scheduleDate, setScheduleDate] = useState("");
    const [actionMessage, setActionMessage] = useState(null);
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const [isLogsOpen, setIsLogsOpen] = useState(false);
    const [isEventLogsOpen, setIsEventLogsOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState(null);
    const [editingFilePath, setEditingFilePath] = useState(null);
    const [latestAgentVersion, setLatestAgentVersion] = useState("");
    const [activeTasks, setActiveTasks] = useState([]);
    const [activeTab, setActiveTab] = useState('overview'); // Add active tab state
    const [scheduledTasks, setScheduledTasks] = useState([]);
    const [newTaskName, setNewTaskName] = useState("");
    const [newTaskCommand, setNewTaskCommand] = useState("");
    const [newTaskSchedule, setNewTaskSchedule] = useState("");

    useEffect(() => {
        fetchServerTimezone();
        const fetchData = async () => {
            try {
                const [machineRes, updatesRes, versionRes] = await Promise.all([
                    axios.get(`/api/frontend/machines/${id}`),
                    axios.get(`/api/frontend/machines/${id}/updates`),
                    axios.get(`/api/frontend/agent/version`)
                ]);
                setMachine(machineRes.data);
                setUpdates(updatesRes.data);
                setLatestAgentVersion(versionRes.data.version);
            } catch (error) {
                console.error("Error fetching data", error);
            }
        };
        fetchData();

        // Poll to refresh updates and track active task status
        const pollUpdatesAndTasks = async () => {
             try {
                const updatesRes = await axios.get(`/api/frontend/machines/${id}/updates`);
                setUpdates(updatesRes.data);
             } catch (e) {}
        };

        const taskInterval = setInterval(pollUpdatesAndTasks, 5000);
        return () => clearInterval(taskInterval);
    }, [id]);

    const fetchMachineData = async () => {
        try {
            const res = await axios.get(`/api/frontend/machines/${id}`);
            setMachine(res.data);
        } catch (e) {
            console.error("Failed to refresh machine data", e);
        }
    };

    // Manage active tasks polling properly outside of the interval
    useEffect(() => {
        if (activeTasks.length === 0) return;

        const checkActiveTasks = async () => {
            let updatedTasks = [...activeTasks];
            let completedAny = false;
            let finalMessage = "";
            for (let taskId of activeTasks) {
                try {
                    const statusRes = await axios.get(`/api/frontend/machines/${id}/tasks/${taskId}`);
                    if (statusRes.data.status === 'completed' || statusRes.data.status === 'failed') {
                        updatedTasks = updatedTasks.filter(t => t !== taskId);
                        completedAny = true;
                        finalMessage = statusRes.data.status === 'completed'
                            ? `Task completed successfully: ${statusRes.data.result_message}`
                            : `Task failed: ${statusRes.data.result_message}`;
                    }
                } catch(e) {}
            }
            if (completedAny) {
                 setActiveTasks(updatedTasks);
                 // Don't show raw JSON dumps for list tasks as action messages
                 if (finalMessage && !finalMessage.startsWith('[') && !finalMessage.includes('FlatLinuxTask')) {
                     const isSuccess = finalMessage.startsWith('Task completed successfully');

                     if (isSuccess && finalMessage.includes('[{')) {
                        setActionMessage({ type: 'success', text: 'Tasks refreshed successfully.' });
                     } else {
                        setActionMessage({
                            type: isSuccess ? 'success' : 'error',
                            text: finalMessage
                        });
                     }
                     setTimeout(() => setActionMessage(null), 5000);
                 }
            }
        };

        const interval = setInterval(checkActiveTasks, 3000);
        return () => clearInterval(interval);
    }, [activeTasks, id]);

    const handleInstallUpdate = async (packageName) => {
        try {
            const taskData = {
                task_type: "update_software",
                payload: JSON.stringify({ package_name: packageName }),
                action_id: generateUUID()
            };
            if (scheduleDate) {
                taskData.scheduled_for = new Date(scheduleDate).toISOString();
            }
            const res = await axios.post(`/api/frontend/machines/${id}/tasks`, taskData);
            setActiveTasks(prev => [...prev, res.data.id]);

            setActionMessage({ type: 'success', text: `Task to update ${packageName || 'all packages'} submitted!${scheduleDate ? ' (Scheduled)' : ''}` });
            setScheduleDate("");
            setTimeout(() => setActionMessage(null), 3000);
        } catch (error) {
            console.error("Error scheduling update", error);
        }
    };

    const handleCheckUpdates = async () => {
        try {
            const res = await axios.post(`/api/frontend/machines/${id}/tasks`, {
                task_type: "check_updates",
                payload: "{}",
                action_id: generateUUID()
            });
            setActiveTasks(prev => [...prev, res.data.id]);
            setActionMessage({ type: 'success', text: 'Task to check for updates submitted. Checking agent in background...' });
            setTimeout(() => setActionMessage(null), 5000);
        } catch (error) {
            console.error("Error scheduling update check", error);
        }
    };

    const handleInstallNewSoftware = async (e) => {
        e.preventDefault();
        try {
            const taskData = {
                task_type: "install_software",
                payload: JSON.stringify({ package_name: installPackageId }),
                action_id: generateUUID()
            };
            if (scheduleDate) {
                taskData.scheduled_for = new Date(scheduleDate).toISOString();
            }
            const res = await axios.post(`/api/frontend/machines/${id}/tasks`, taskData);
            setActiveTasks(prev => [...prev, res.data.id]);
            setActionMessage({ type: 'success', text: `Task to install ${installPackageId} submitted!${scheduleDate ? ' (Scheduled)' : ''}` });
            setInstallPackageId("");
            setScheduleDate("");
            setTimeout(() => setActionMessage(null), 3000);

            // Re-fetch updates list shortly after submitting task
            setTimeout(async () => {
                try {
                    const updatesRes = await axios.get(`/api/frontend/machines/${id}/updates`);
                    setUpdates(updatesRes.data);
                } catch(e){}
            }, 3000);

        } catch (error) {
            console.error("Error scheduling install", error);
        }
    };

    const handleUninstallSoftware = async (packageName) => {
        if (!window.confirm(`Are you sure you want to completely uninstall ${packageName}?`)) {
            return;
        }

        try {
            const taskData = {
                task_type: "uninstall_software",
                payload: JSON.stringify({ package_name: packageName }),
                action_id: generateUUID()
            };
            if (scheduleDate) {
                taskData.scheduled_for = new Date(scheduleDate).toISOString();
            }
            const res = await axios.post(`/api/frontend/machines/${id}/tasks`, taskData);
            setActiveTasks(prev => [...prev, res.data.id]);
            setActionMessage({ type: 'success', text: `Task to uninstall ${packageName} submitted!${scheduleDate ? ' (Scheduled)' : ''}` });
            setScheduleDate("");
            setTimeout(() => setActionMessage(null), 3000);

            // Re-fetch updates list shortly after submitting task
            setTimeout(async () => {
                try {
                    const updatesRes = await axios.get(`/api/frontend/machines/${id}/updates`);
                    setUpdates(updatesRes.data);
                } catch(e){}
            }, 3000);
        } catch (error) {
            console.error("Error scheduling uninstallation", error);
        }
    };

const fetchScheduledTasks = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`/api/frontend/machines/${id}/scheduled-tasks`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setScheduledTasks(res.data);
        } catch (error) {
            console.error("Error fetching cached scheduled tasks", error);
        }
    };

    const handleRefreshScheduledTasks = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/frontend/machines/${id}/tasks`, {
                task_type: "list_scheduled_tasks",
                payload: JSON.stringify({}),
                action_id: generateUUID()
            }, { headers: { Authorization: `Bearer ${token}` } });

            setActiveTasks(prev => [...prev, res.data.id]);
            setActionMessage({ type: 'info', text: 'Fetching latest tasks from agent...' });

            // Poll for completion to update cache
            const pollTaskId = res.data.id;
            let attempts = 0;
            const interval = setInterval(async () => {
                attempts++;
                try {
                    const taskRes = await axios.get(`/api/frontend/machines/${id}/tasks/${pollTaskId}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (taskRes.data.status === 'completed') {
                        clearInterval(interval);
                        // Fetch the newly updated cache
                        fetchScheduledTasks();
                    } else if (taskRes.data.status === 'failed' || attempts > 20) {
                        clearInterval(interval);
                    }
                } catch(e) {}
            }, 1000);

        } catch (error) {
            console.error("Error asking agent to refresh tasks", error);
        }
    };

        const handleAddScheduledTask = async (e) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/frontend/machines/${id}/tasks`, {
                task_type: "add_scheduled_task",
                payload: JSON.stringify({
                    task_name: newTaskName,
                    command: newTaskCommand,
                    schedule_time: newTaskSchedule || (machine.os_name === "Windows" ? "ONCE" : "0 * * * *")
                }),
                action_id: generateUUID()
            }, { headers: { Authorization: `Bearer ${token}` } });
            setActiveTasks(prev => [...prev, res.data.id]);
            setActionMessage({ type: 'success', text: `Task to add scheduled task '${newTaskName}' submitted!` });
            setNewTaskName("");
            setNewTaskCommand("");
            setNewTaskSchedule("");
            setTimeout(() => setActionMessage(null), 3000);

            // Re-fetch after a delay
            setTimeout(fetchScheduledTasks, 4000);
        } catch (error) {
            console.error("Error adding scheduled task", error);
        }
    };

    const handleDeleteScheduledTask = async (taskName) => {
        if (!window.confirm(`Are you sure you want to delete task '${taskName}'?`)) return;
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/frontend/machines/${id}/tasks`, {
                task_type: "delete_scheduled_task",
                payload: JSON.stringify({ task_name: taskName }),
                action_id: generateUUID()
            }, { headers: { Authorization: `Bearer ${token}` } });
            setActiveTasks(prev => [...prev, res.data.id]);
            setActionMessage({ type: 'success', text: `Task to delete scheduled task '${taskName}' submitted!` });
            setTimeout(() => setActionMessage(null), 3000);

            // Re-fetch after a delay
            setTimeout(fetchScheduledTasks, 4000);
        } catch (error) {
            console.error("Error deleting scheduled task", error);
        }
    };

    const handleRunScheduledTask = async (taskName) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`/api/frontend/machines/${id}/tasks`, {
                task_type: "run_scheduled_task",
                payload: JSON.stringify({ task_name: taskName }),
                action_id: generateUUID()
            }, { headers: { Authorization: `Bearer ${token}` } });
            setActiveTasks(prev => [...prev, res.data.id]);
            setActionMessage({ type: 'success', text: `Task to run scheduled task '${taskName}' submitted!` });
            setTimeout(() => setActionMessage(null), 3000);
        } catch (error) {
            console.error("Error running scheduled task", error);
        }
    };

    // Use effect to fetch scheduled tasks on tab change
    useEffect(() => {
        if (activeTab === 'scheduled_tasks') {
            fetchScheduledTasks();
        }
    }, [activeTab]);

        const handleConfigureKopia = async (e) => {
        e.preventDefault();
        try {
            const pathsArray = kopiaPaths.split(',').map(p => p.trim()).filter(p => p);
            await axios.post(`/api/frontend/machines/${id}/tasks`, {
                task_type: "configure_kopia",
                payload: JSON.stringify({ paths: pathsArray }),
                action_id: generateUUID()
            });
            setActionMessage({ type: 'success', text: 'Kopia configuration task submitted!' });
            setKopiaPaths("");
            setTimeout(() => setActionMessage(null), 3000);
        } catch (error) {
            console.error("Error scheduling Kopia config", error);
        }
    };

    const handleSelectPath = (path) => {
        setKopiaPaths(prev => prev ? `${prev}, ${path}` : path);
        setIsBrowserOpen(false);
    };

    // Attempt to parse kopia config JSON for display
    let activeKopiaPolicies = [];
    if (machine && machine.kopia_config) {
        try {
             const parsed = JSON.parse(machine.kopia_config);
             if (Array.isArray(parsed)) activeKopiaPolicies = parsed;
        } catch (e) {
             // Fallback to raw string if not JSON array
        }
    }

    if (!machine) return <div className="p-6">Loading...</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <Link to="/" className="flex items-center text-blue-600 hover:text-blue-800 mb-6">
                <ArrowLeft size={16} className="mr-1" /> Back to Dashboard
            </Link>

            {actionMessage && (
                <div className={`px-4 py-3 rounded mb-4 border flex justify-between items-start shadow-sm
                    ${actionMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
                      actionMessage.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                      actionMessage.type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                      'bg-green-50 border-green-200 text-green-700'}`}>
                    <div className="flex-1">
                        <p className="line-clamp-2" title={actionMessage.text}>
                            {actionMessage.text}
                        </p>
                        {actionMessage.text && actionMessage.text.length > 150 && (
                            <p className="text-xs mt-1 opacity-75 italic">(Message truncated. Check logs for more details)</p>
                        )}
                    </div>
                    <button onClick={() => setActionMessage(null)} className="ml-4 opacity-60 hover:opacity-100">
                        &times;
                    </button>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex space-x-1 border-b border-gray-200 mb-6 bg-white p-1 rounded-t-lg shadow-sm">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        activeTab === 'overview'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                >
                    <List size={16} className="mr-2" /> Overview
                </button>
                <button
                    onClick={() => setActiveTab('backups')}
                    className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        activeTab === 'backups'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                >
                    <Archive size={16} className="mr-2" /> Backups
                </button>
                <button
                    onClick={() => setActiveTab('scheduled_tasks')}
                    className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        activeTab === 'scheduled_tasks'
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                >
                    <Clock size={16} className="mr-2" /> Scheduled Tasks
                </button>
            </div>

            {/* Tab Content */}
            <div className={`${activeTab === 'overview' ? 'grid grid-cols-1 lg:grid-cols-3 gap-6' : 'hidden'}`}>
                {/* Hardware Info Panel */}
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                    <div className="flex justify-between items-center border-b pb-2 mb-4">
                        <h2 className="text-xl font-bold">System Information</h2>
                        <div className="flex space-x-2">
                            <button
                                onClick={() => setIsLogsOpen(true)}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 text-xs rounded shadow flex items-center"
                            >
                                <Terminal size={14} className="mr-1"/> Agent Logs
                            </button>
                            <button
                                onClick={() => setIsEventLogsOpen(true)}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 text-xs rounded shadow flex items-center"
                            >
                                Event Logs
                            </button>
                            {latestAgentVersion !== "unknown" && (!machine.agent_version || machine.agent_version !== latestAgentVersion) && (
                                <button
                                    onClick={async () => {
                                    try {
                                        await axios.post(`/api/frontend/machines/${machine.id}/tasks`, {
                                            task_type: "update_agent",
                                            payload: "{}",
                                            action_id: generateUUID()
                                        });
                                        setActionMessage({ type: 'success', text: 'Agent update command sent.' });
                                        setTimeout(() => setActionMessage(null), 3000);
                                    } catch (error) {
                                        console.error("Failed to update agent", error);
                                    }
                                }}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded shadow"
                                >
                                    Update Agent to v{latestAgentVersion}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Hostname / OS</p>
                                <p className="text-lg font-medium">{machine.hostname}</p>
                                <p className="text-sm text-gray-600">{machine.os_name} {machine.os_version}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Agent Version</p>
                                <p className={`text-sm font-medium ${(!machine.agent_version || machine.agent_version !== latestAgentVersion) ? 'text-red-600' : 'text-green-600'}`}>
                                    v{machine.agent_version || "Unknown"}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start">
                            <Cpu className="text-gray-400 mr-3 mt-1" size={20} />
                            <div>
                                <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">CPU</p>
                                <p>{machine.cpu_info}</p>
                            </div>
                        </div>
                        <div className="flex items-start">
                            <Database className="text-gray-400 mr-3 mt-1" size={20} />
                            <div>
                                <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Memory</p>
                                <p>{machine.memory_total} MB</p>
                            </div>
                        </div>
                        <div className="flex items-start">
                            <HardDrive className="text-gray-400 mr-3 mt-1" size={20} />
                            <div className="w-full">
                                <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider mb-2">Disk</p>
                                <div className="flex items-center space-x-4">
                                    <div className="h-24 w-24">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'Used', value: machine.disk_used },
                                                        { name: 'Free', value: machine.disk_total - machine.disk_used }
                                                    ]}
                                                    cx="50%" cy="50%"
                                                    innerRadius={25} outerRadius={40}
                                                    dataKey="value" stroke="none"
                                                >
                                                    <Cell key="cell-0" fill="#EF4444" /> {/* Red for used */}
                                                    <Cell key="cell-1" fill="#E5E7EB" /> {/* Gray for free */}
                                                </Pie>
                                                <Tooltip formatter={(value) => `${value} GB`} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="text-sm">
                                        <p><span className="inline-block w-3 h-3 bg-red-500 rounded-full mr-1"></span> Used: {machine.disk_used} GB</p>
                                        <p><span className="inline-block w-3 h-3 bg-gray-200 rounded-full mr-1"></span> Free: {machine.disk_total - machine.disk_used} GB</p>
                                        <p className="mt-1 text-xs text-gray-400">Total: {machine.disk_total} GB</p>
                                        {machine.disk_total > 0 && ((machine.disk_total - machine.disk_used) / machine.disk_total) < 0.1 && (
                                            <p className="mt-2 text-xs font-bold text-red-600 bg-red-50 p-1 rounded border border-red-200">
                                                Warning: Low Disk Space
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {machine.network_info && (
                            <div className="pt-4 border-t border-gray-100">
                                <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider mb-2">Network Interfaces</p>
                                <div className="text-sm space-y-2 max-h-32 overflow-y-auto">
                                    {JSON.parse(machine.network_info).map((net, idx) => (
                                        <div key={idx} className="flex justify-between border-b border-gray-50 pb-1">
                                            <span className="font-medium text-gray-700">{net.interface}</span>
                                            <span className="text-gray-500">{net.ip}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Updates Panel */}
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 lg:col-span-2">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h2 className="text-xl font-bold">Software Updates</h2>
                        <div className="flex space-x-2">
                            <button
                                onClick={handleCheckUpdates}
                                disabled={activeTasks.length > 0}
                                className="flex items-center bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200 transition-colors text-sm border border-gray-300 disabled:opacity-50"
                            >
                                <RefreshCw size={14} className={`mr-2 ${activeTasks.length > 0 ? 'animate-spin' : ''}`} /> Check Updates
                            </button>
                            <button
                                onClick={() => handleInstallUpdate(null)}
                                disabled={activeTasks.length > 0}
                                className="flex items-center bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                            >
                                <RefreshCw size={14} className="mr-2" /> Update All
                            </button>
                        </div>
                    </div>

                    <div className="mb-4 flex items-center space-x-4 bg-blue-50 p-3 rounded">
                        <label className="text-sm font-medium text-blue-800">Schedule Task (Optional):</label>
                        <input
                            type="datetime-local"
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            className="px-3 py-1 border border-blue-200 rounded text-sm focus:ring-blue-500"
                        />
                        {scheduleDate && <button onClick={() => setScheduleDate("")} className="text-xs text-red-500 hover:text-red-700">Clear</button>}
                    </div>

                    {updates.length === 0 ? (
                        <p className="text-gray-500 italic">No updates available or agent hasn't reported yet.</p>
                    ) : (
                        <div className="overflow-auto max-h-96 space-y-6">
                            {/* Software Updates */}
                            {updates.filter(u => u.update_type === 'software').length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2 bg-gray-50 py-1 px-2 rounded">Software Updates</h3>
                                    <table className="min-w-full text-left text-sm whitespace-nowrap">
                                        <thead className="uppercase tracking-wider border-b-2 border-gray-200">
                                            <tr>
                                                <th className="px-4 py-2 font-medium text-gray-500">Package</th>
                                                <th className="px-4 py-2 font-medium text-gray-500">Current</th>
                                                <th className="px-4 py-2 font-medium text-gray-500">New Version</th>
                                                <th className="px-4 py-2 font-medium text-gray-500">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {updates.filter(u => u.update_type === 'software').map((update, idx) => (
                                                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="px-4 py-2 font-medium text-gray-900" title={update.description}>{update.package_name}</td>
                                                    <td className="px-4 py-2 text-gray-500">{update.current_version || '-'}</td>
                                                    <td className="px-4 py-2 text-blue-600 font-semibold">{update.new_version}</td>
                                                    <td className="px-4 py-2 space-x-2">
                                                        <button
                                                            onClick={() => handleInstallUpdate(update.package_name)}
                                                            disabled={activeTasks.length > 0}
                                                            className="text-blue-600 hover:text-blue-900 text-xs font-semibold px-2 py-1 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50"
                                                        >
                                                            Update
                                                        </button>
                                                        <button
                                                            onClick={() => handleUninstallSoftware(update.package_name)}
                                                            disabled={activeTasks.length > 0}
                                                            className="text-red-600 hover:text-red-900 text-xs font-semibold px-2 py-1 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                                                        >
                                                            Remove
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Install New Software Form */}
                            <div className="pt-4 border-t flex flex-col space-y-4">
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">Install New Software (Package Manager)</h3>
                                    <form onSubmit={handleInstallNewSoftware} className="flex space-x-2">
                                        <input
                                            type="text"
                                            value={installPackageId}
                                            onChange={(e) => setInstallPackageId(e.target.value)}
                                            disabled={activeTasks.length > 0}
                                            placeholder="Enter Package ID (e.g. Mozilla.Firefox or firefox)"
                                            className="flex-grow px-3 py-1.5 border rounded text-sm focus:ring-blue-500 disabled:opacity-50"
                                            required
                                        />
                                        <button type="submit" disabled={activeTasks.length > 0} className="flex items-center bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50 min-w-[100px] justify-center">
                                            <RefreshCw size={14} className={`mr-2 ${activeTasks.length > 0 ? 'animate-spin block' : 'hidden'}`} /> Install
                                        </button>
                                    </form>
                                </div>
                            </div>

                            {/* OS Updates */}
                            {updates.filter(u => u.update_type === 'os').length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2 bg-gray-50 py-1 px-2 rounded">OS Updates</h3>
                                    <table className="min-w-full text-left text-sm whitespace-nowrap">
                                        <thead className="uppercase tracking-wider border-b-2 border-gray-200">
                                            <tr>
                                                <th className="px-4 py-2 font-medium text-gray-500">Update Title</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {updates.filter(u => u.update_type === 'os').map((update, idx) => (
                                                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="px-4 py-2 font-medium text-gray-900">{update.package_name}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <p className="mt-2 text-xs text-gray-400 italic">OS Updates must be installed manually on the host machine.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div> {/* End of Overview Grid */}

            {/* Backups Tab */}
            <div className={`${activeTab === 'backups' ? 'block' : 'hidden'}`}>
                {/* Backup Panel */}
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                    <div className="flex items-center mb-4 border-b pb-2">
                        <Archive className="text-purple-600 mr-2" size={24} />
                        <h2 className="text-xl font-bold">Configure Backups</h2>
                    </div>
                    <form onSubmit={handleConfigureKopia} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Directories to Backup (comma separated)
                            </label>
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    value={kopiaPaths}
                                    onChange={(e) => setKopiaPaths(e.target.value)}
                                    placeholder="e.g. /home/user/Documents, /var/www"
                                    className="flex-grow px-4 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsBrowserOpen(true)}
                                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition-colors flex items-center"
                                >
                                    <FolderSearch size={16} className="mr-2" /> Browse
                                </button>
                            </div>
                        </div>
                        <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors">
                            Push Backup Config to Agent
                        </button>
                    </form>
                    <p className="mt-4 text-sm text-gray-500 italic mb-4">
                        Note: Backup server connection settings are managed globally in Settings.
                    </p>

                    {machine.kopia_config && (
                        <div className="mt-6 border-t pt-4">
                            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">Active Agent Policies</h3>
                            {activeKopiaPolicies.length > 0 ? (
                                <ul className="bg-gray-50 p-4 rounded text-sm text-gray-800 overflow-auto border border-gray-200 max-h-48 space-y-2">
                                    {activeKopiaPolicies.map((policy, idx) => {
                                        // Simple logic to append .kopiaignore to directory path
                                        let ignorePath = "";
                                        if (policy.target?.path) {
                                            const separator = machine.os === "Windows" ? "\\" : "/";
                                            ignorePath = policy.target.path.endsWith(separator)
                                                ? `${policy.target.path}.kopiaignore`
                                                : `${policy.target.path}${separator}.kopiaignore`;
                                        }

                                        return (
                                            <li key={idx} className="flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold">{policy.target?.path || policy.id}</span>
                                                    <span className="text-xs text-gray-500">Retention: {policy.retentionPolicy?.keepLatest || policy.retention?.keepLatest || 'Default'} latest</span>
                                                </div>
                                                <div className="flex space-x-2">
                                                    {ignorePath && (
                                                        <button
                                                            onClick={() => setEditingFilePath(ignorePath)}
                                                            className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded transition-colors"
                                                        >
                                                            Edit .kopiaignore
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setEditingPolicy(policy)}
                                                        className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded transition-colors"
                                                    >
                                                        Edit Policy
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <pre className="bg-gray-50 p-4 rounded text-xs text-gray-800 overflow-auto border border-gray-200 max-h-48">
                                    {machine.kopia_config}
                                </pre>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Scheduled Tasks Tab */}
            <div className={`${activeTab === 'scheduled_tasks' ? 'block' : 'hidden'}`}>
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <div className="flex items-center">
                            <Clock className="text-blue-600 mr-2" size={24} />
                            <h2 className="text-xl font-bold">Scheduled Tasks</h2>
                        </div>
                        <button
                            onClick={handleRefreshScheduledTasks}
                            disabled={activeTasks.length > 0}
                            className="text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded shadow-sm text-sm flex items-center transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={`mr-1 ${activeTasks.length > 0 ? 'animate-spin block' : ''}`} /> Refresh
                        </button>
                    </div>

                    {/* List Tasks */}
                    <div className="mb-8">
                        {(() => {
                            if (scheduledTasks.length === 0) {
                                return (
                                    <div className="text-gray-500 py-8 text-center bg-gray-50 rounded border border-dashed border-gray-300">
                                        No tasks scheduled yet.
                                    </div>
                                );
                            }

                            // Build nested tree structure for hierarchical tasks
                            const flatTasks = [];
                            const tree = { name: "Root", children: {}, tasks: [] };

                            scheduledTasks.forEach(task => {
                                const name = task.task_name || "";
                                if (name.includes('\\')) {
                                    const parts = name.split('\\').filter(p => p !== "");

                                    if (parts.length === 1) {
                                         // It's a root level windows task like \MyTask
                                         tree.tasks.push({ ...task, shortName: parts[0] });
                                         return;
                                    }

                                    const shortName = parts.pop();

                                    let currentNode = tree;
                                    parts.forEach(part => {
                                        if (!currentNode.children) currentNode.children = {};
                                        if (!currentNode.children[part]) {
                                            currentNode.children[part] = { name: part, children: {}, tasks: [] };
                                        }
                                        currentNode = currentNode.children[part];
                                    });

                                    if (!currentNode.tasks) currentNode.tasks = [];
                                    currentNode.tasks.push({ ...task, shortName });
                                } else {
                                    // Linux cron jobs or other flat tasks
                                    flatTasks.push({ ...task, shortName: name });
                                }
                            });

                            return (
                                <div>
                                    {/* Render flat tasks first (if any) in a standard table */}
                                    {flatTasks.length > 0 && (
                                        <div className="mb-6">
                                            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">General Tasks</h3>
                                            <div className="border border-gray-200 rounded overflow-hidden">
                                                <table className="min-w-full text-left text-sm whitespace-nowrap">
                                                    <thead className="uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50">
                                                        <tr>
                                                            <th className="px-4 py-2 font-medium text-gray-500 w-1/3">Task Name</th>
                                                            <th className="px-4 py-2 font-medium text-gray-500 w-1/4">Schedule</th>
                                                            <th className="px-4 py-2 font-medium text-gray-500 w-1/4">Command / Action</th>
                                                            <th className="px-4 py-2 font-medium text-gray-500 w-1/6">Controls</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {flatTasks.map((task, idx) => (
                                                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                                                <td className="px-4 py-2 font-medium text-gray-900">{task.shortName}</td>
                                                                <td className="px-4 py-2 text-gray-600">{task.schedule}</td>
                                                                <td className="px-4 py-2 text-gray-500 font-mono text-xs truncate max-w-[200px]" title={task.command}>{task.command}</td>
                                                                <td className="px-4 py-2 space-x-2">
                                                                    <button
                                                                        onClick={() => handleRunScheduledTask(task.task_name)}
                                                                        disabled={activeTasks.length > 0}
                                                                        className="text-blue-600 hover:text-blue-900 text-xs font-semibold px-2 py-1 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50"
                                                                    >
                                                                        Run Now
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteScheduledTask(task.task_name)}
                                                                        disabled={activeTasks.length > 0}
                                                                        className="text-red-600 hover:text-red-900 text-xs font-semibold px-2 py-1 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Render Windows Task Tree */}
                                    {(Object.keys(tree.children || {}).length > 0 || tree.tasks.length > 0) && (
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Windows Task Library</h3>
                                            <TaskFolder
                                                node={{...tree, name: "\\ (Root)"}}
                                                onRun={handleRunScheduledTask}
                                                onDelete={handleDeleteScheduledTask}
                                                disabled={activeTasks.length > 0}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    {/* Add Task Form */}
                    <div className="pt-6 border-t border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Add New Task</h3>
                        <form onSubmit={handleAddScheduledTask} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Task Name</label>
                                <input
                                    type="text"
                                    value={newTaskName}
                                    onChange={(e) => setNewTaskName(e.target.value)}
                                    placeholder="e.g. DailyCleanup"
                                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
                                    required
                                    disabled={activeTasks.length > 0}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Schedule <span className="text-xs text-gray-500 font-normal">({machine?.os_name === 'Windows' ? 'e.g. ONCE, DAILY, MINUTE' : 'Cron e.g. 0 0 * * *'})</span>
                                </label>
                                <input
                                    type="text"
                                    value={newTaskSchedule}
                                    onChange={(e) => setNewTaskSchedule(e.target.value)}
                                    placeholder={machine?.os_name === 'Windows' ? 'ONCE' : '0 0 * * *'}
                                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
                                    disabled={activeTasks.length > 0}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Command / Script</label>
                                <input
                                    type="text"
                                    value={newTaskCommand}
                                    onChange={(e) => setNewTaskCommand(e.target.value)}
                                    placeholder="e.g. winget upgrade --all or /usr/bin/apt update"
                                    className="w-full px-3 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
                                    required
                                    disabled={activeTasks.length > 0}
                                />
                            </div>
                            <div className="md:col-span-3 flex justify-end">
                                <button
                                    type="submit"
                                    disabled={activeTasks.length > 0}
                                    className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
                                >
                                    <RefreshCw size={16} className={`mr-2 ${activeTasks.length > 0 ? 'animate-spin block' : 'hidden'}`} /> Add Task
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {isBrowserOpen && (
                <RemoteFileBrowser
                    machineId={machine.id}
                    onClose={() => setIsBrowserOpen(false)}
                    onSelectPath={handleSelectPath}
                />
            )}

            {isLogsOpen && (
                <MachineLogsModal
                    machineId={machine.id}
                    onClose={() => setIsLogsOpen(false)}
                />
            )}

            {isEventLogsOpen && (
                <EventLogsModal
                    machineId={machine.id}
                    onClose={() => setIsEventLogsOpen(false)}
                />
            )}

            {editingPolicy && (
                <KopiaPolicyModal
                    machineId={machine.id}
                    policy={editingPolicy}
                    onClose={(changed) => {
                        setEditingPolicy(null);
                        if (changed) fetchMachineData();
                    }}
                />
            )}

            {editingFilePath && (
                <TextEditorModal
                    machineId={machine.id}
                    filePath={editingFilePath}
                    onClose={() => setEditingFilePath(null)}
                />
            )}
        </div>
    );
}

export default MachineDetails;
