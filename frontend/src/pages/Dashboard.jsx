import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Server, Monitor, Clock, AlertTriangle, Download } from 'lucide-react';
import { fetchServerTimezone, formatTime } from '../utils/timezone';

function Dashboard() {
    const [machines, setMachines] = useState([]);

    useEffect(() => {
        fetchServerTimezone(); // pre-fetch timezone on dashboard load

        const fetchMachines = async () => {
            try {
                const response = await axios.get('/api/frontend/machines');
                setMachines(response.data);
            } catch (error) {
                console.error("Error fetching machines", error);
            }
        };

        fetchMachines();
        const interval = setInterval(fetchMachines, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleDownloadAgent = async () => {
        try {
            const response = await axios.get('/api/frontend/agent/download', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'agent.py');
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch(e) {
            console.error("Failed to download agent", e);
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                <button
                    onClick={handleDownloadAgent}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md shadow flex items-center transition-colors"
                >
                    <Monitor size={18} className="mr-2"/> Download Agent
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {machines.map(machine => (
                    <Link to={`/machine/${machine.id}`} key={machine.id} className="block hover:shadow-xl transition-shadow duration-200">
                        <div className="bg-white rounded-lg p-6 shadow-md border border-gray-200">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-3">
                                    <Monitor className="text-blue-500" size={24} />
                                    <h2 className="text-xl font-semibold text-gray-800">{machine.hostname}</h2>
                                </div>
                                <div className="flex items-center space-x-3">
                                    {machine.pending_os_updates > 0 && (
                                        <div className="flex items-center text-red-600 animate-pulse" title={`${machine.pending_os_updates} OS Update(s) Pending`}>
                                            <AlertTriangle size={18} />
                                        </div>
                                    )}
                                    {machine.pending_software_updates > 0 && (
                                        <div className="flex items-center text-yellow-500" title={`${machine.pending_software_updates} Software Update(s) Pending`}>
                                            <Download size={18} />
                                        </div>
                                    )}
                                    <div className={`w-3 h-3 rounded-full ${machine.is_online ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm text-gray-600">
                                <p className="flex justify-between"><span>OS:</span> <span className="font-medium">{machine.os_name} {machine.os_version}</span></p>
                                <p className="flex justify-between"><span>IP:</span> <span className="font-medium">{machine.ip_address}</span></p>
                                <p className="flex items-center justify-between mt-4 pt-4 border-t text-xs text-gray-500">
                                    <span className="flex items-center"><Clock size={12} className="mr-1"/> Last seen:</span>
                                    <span>{formatTime(machine.last_seen)}</span>
                                </p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {machines.length === 0 && (
                <div className="text-center text-gray-500 mt-12">
                    <Server size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-xl">No machines registered yet.</p>
                    <p className="text-sm mt-2">Install the agent on your client machines to see them here.</p>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
