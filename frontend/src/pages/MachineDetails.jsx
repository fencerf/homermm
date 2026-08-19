import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Cpu, HardDrive, Database, RefreshCw, Archive, FolderSearch } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import RemoteFileBrowser from '../components/RemoteFileBrowser';

function MachineDetails() {
    const { id } = useParams();
    const [machine, setMachine] = useState(null);
    const [updates, setUpdates] = useState([]);
    const [kopiaPaths, setKopiaPaths] = useState("");
    const [installPackageId, setInstallPackageId] = useState("");
    const [scheduleDate, setScheduleDate] = useState("");
    const [actionMessage, setActionMessage] = useState("");
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [machineRes, updatesRes] = await Promise.all([
                    axios.get(`/api/frontend/machines/${id}`),
                    axios.get(`/api/frontend/machines/${id}/updates`)
                ]);
                setMachine(machineRes.data);
                setUpdates(updatesRes.data);
            } catch (error) {
                console.error("Error fetching data", error);
            }
        };
        fetchData();
    }, [id]);

    const handleInstallUpdate = async (packageName) => {
        try {
            const taskData = {
                task_type: "update_software",
                payload: JSON.stringify({ package_name: packageName })
            };
            if (scheduleDate) {
                taskData.scheduled_for = new Date(scheduleDate).toISOString();
            }
            await axios.post(`/api/frontend/machines/${id}/tasks`, taskData);
            setActionMessage(`Task to update ${packageName || 'all packages'} submitted!${scheduleDate ? ' (Scheduled)' : ''}`);
            setScheduleDate("");
            setTimeout(() => setActionMessage(""), 3000);
        } catch (error) {
            console.error("Error scheduling update", error);
        }
    };

    const handleInstallNewSoftware = async (e) => {
        e.preventDefault();
        try {
            const taskData = {
                task_type: "install_software",
                payload: JSON.stringify({ package_name: installPackageId })
            };
            if (scheduleDate) {
                taskData.scheduled_for = new Date(scheduleDate).toISOString();
            }
            await axios.post(`/api/frontend/machines/${id}/tasks`, taskData);
            setActionMessage(`Task to install ${installPackageId} submitted!${scheduleDate ? ' (Scheduled)' : ''}`);
            setInstallPackageId("");
            setScheduleDate("");
            setTimeout(() => setActionMessage(""), 3000);
        } catch (error) {
            console.error("Error scheduling install", error);
        }
    };

    const handleConfigureKopia = async (e) => {
        e.preventDefault();
        try {
            const pathsArray = kopiaPaths.split(',').map(p => p.trim()).filter(p => p);
            await axios.post(`/api/frontend/machines/${id}/tasks`, {
                task_type: "configure_kopia",
                payload: JSON.stringify({ paths: pathsArray })
            });
            setActionMessage("Kopia configuration task submitted!");
            setKopiaPaths("");
            setTimeout(() => setActionMessage(""), 3000);
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
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                    {actionMessage}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Hardware Info Panel */}
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                    <div className="flex justify-between items-center border-b pb-2 mb-4">
                        <h2 className="text-xl font-bold">System Information</h2>
                        <button
                            onClick={async () => {
                                try {
                                    await axios.post(`/api/frontend/machines/${machine.id}/tasks`, {
                                        task_type: "shutdown_agent",
                                        payload: "{}"
                                    });
                                    setActionMessage("Agent shutdown command sent.");
                                    setTimeout(() => setActionMessage(""), 3000);
                                } catch (error) {
                                    console.error("Failed to shutdown", error);
                                }
                            }}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded shadow"
                        >
                            Shutdown Agent
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Hostname / OS</p>
                            <p className="text-lg font-medium">{machine.hostname}</p>
                            <p className="text-sm text-gray-600">{machine.os_name} {machine.os_version}</p>
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
                        <button
                            onClick={() => handleInstallUpdate(null)}
                            className="flex items-center bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors text-sm"
                        >
                            <RefreshCw size={14} className="mr-2" /> Update All
                        </button>
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
                                                    <td className="px-4 py-2">
                                                        <button
                                                            onClick={() => handleInstallUpdate(update.package_name)}
                                                            className="text-blue-600 hover:text-blue-900 text-xs font-semibold px-2 py-1 border border-blue-200 rounded hover:bg-blue-50"
                                                        >
                                                            Install
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Install New Software Form */}
                            <div className="pt-4 border-t">
                                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">Install New Software (Winget)</h3>
                                <form onSubmit={handleInstallNewSoftware} className="flex space-x-2">
                                    <input
                                        type="text"
                                        value={installPackageId}
                                        onChange={(e) => setInstallPackageId(e.target.value)}
                                        placeholder="Enter Winget Package ID (e.g. Mozilla.Firefox)"
                                        className="flex-grow px-3 py-1.5 border rounded text-sm focus:ring-blue-500"
                                        required
                                    />
                                    <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
                                        Install
                                    </button>
                                </form>
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

                {/* Kopia Backup Panel */}
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 lg:col-span-3">
                    <div className="flex items-center mb-4 border-b pb-2">
                        <Archive className="text-purple-600 mr-2" size={24} />
                        <h2 className="text-xl font-bold">Configure Kopia Backups</h2>
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
                            Push Kopia Config to Agent
                        </button>
                    </form>
                    <p className="mt-4 text-sm text-gray-500 italic mb-4">
                        Note: Kopia server connection settings are managed globally in Settings.
                    </p>

                    {machine.kopia_config && (
                        <div className="mt-6 border-t pt-4">
                            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">Active Agent Policies</h3>
                            {activeKopiaPolicies.length > 0 ? (
                                <ul className="bg-gray-50 p-4 rounded text-sm text-gray-800 overflow-auto border border-gray-200 max-h-48 space-y-2">
                                    {activeKopiaPolicies.map((policy, idx) => (
                                        <li key={idx} className="flex flex-col border-b pb-2 last:border-b-0 last:pb-0">
                                            <span className="font-semibold">{policy.target?.path || policy.id}</span>
                                            <span className="text-xs text-gray-500">Retention: {policy.retention?.keepLatest || 'Default'}</span>
                                        </li>
                                    ))}
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

            {isBrowserOpen && (
                <RemoteFileBrowser
                    machineId={machine.id}
                    onClose={() => setIsBrowserOpen(false)}
                    onSelectPath={handleSelectPath}
                />
            )}
        </div>
    );
}

export default MachineDetails;
