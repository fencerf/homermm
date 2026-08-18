import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Cpu, HardDrive, Database, RefreshCw, Archive } from 'lucide-react';

function MachineDetails() {
    const { id } = useParams();
    const [machine, setMachine] = useState(null);
    const [updates, setUpdates] = useState([]);
    const [kopiaPaths, setKopiaPaths] = useState("");
    const [actionMessage, setActionMessage] = useState("");

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [machineRes, updatesRes] = await Promise.all([
                    axios.get(`http://127.0.0.1:8000/api/frontend/machines/${id}`),
                    axios.get(`http://127.0.0.1:8000/api/frontend/machines/${id}/updates`)
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
            await axios.post(`http://127.0.0.1:8000/api/frontend/machines/${id}/tasks`, {
                task_type: "update_software",
                payload: JSON.stringify({ package_name: packageName })
            });
            setActionMessage(`Task to update ${packageName || 'all packages'} submitted!`);
            setTimeout(() => setActionMessage(""), 3000);
        } catch (error) {
            console.error("Error scheduling update", error);
        }
    };

    const handleConfigureKopia = async (e) => {
        e.preventDefault();
        try {
            const pathsArray = kopiaPaths.split(',').map(p => p.trim()).filter(p => p);
            await axios.post(`http://127.0.0.1:8000/api/frontend/machines/${id}/tasks`, {
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
                    <h2 className="text-xl font-bold mb-4 border-b pb-2">System Information</h2>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Hostname</p>
                            <p className="text-lg">{machine.hostname}</p>
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
                            <div>
                                <p className="text-sm text-gray-500 font-semibold uppercase tracking-wider">Disk</p>
                                <p>{machine.disk_total} GB</p>
                            </div>
                        </div>
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

                    {updates.length === 0 ? (
                        <p className="text-gray-500 italic">No updates available or agent hasn't reported yet.</p>
                    ) : (
                        <div className="overflow-auto max-h-96">
                            <table className="min-w-full text-left text-sm whitespace-nowrap">
                                <thead className="uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 font-medium text-gray-600">Package</th>
                                        <th className="px-4 py-3 font-medium text-gray-600">New Version</th>
                                        <th className="px-4 py-3 font-medium text-gray-600">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {updates.map((update, idx) => (
                                        <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-900">{update.package_name}</td>
                                            <td className="px-4 py-3 text-gray-500">{update.new_version}</td>
                                            <td className="px-4 py-3">
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
                            <input
                                type="text"
                                value={kopiaPaths}
                                onChange={(e) => setKopiaPaths(e.target.value)}
                                placeholder="e.g. /home/user/Documents, /var/www"
                                className="w-full px-4 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors">
                            Push Kopia Config to Agent
                        </button>
                    </form>
                    <p className="mt-4 text-sm text-gray-500 italic">
                        Note: Kopia server connection settings are managed globally in Settings.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default MachineDetails;
