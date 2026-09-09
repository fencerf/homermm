import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Server, Monitor, Clock, AlertTriangle, Download } from 'lucide-react';
import { fetchServerTimezone, formatTime } from '../utils/timezone';


const getFingerprint = async (pubKey) => {
    if (!pubKey) return "UNKNOWN";
    const cleanKey = pubKey.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replace(/\n/g, "").trim();

    // Fallback for non-secure contexts (e.g., HTTP without localhost) where crypto.subtle is undefined
    if (!window.crypto || !window.crypto.subtle) {
        return "INSECURE_ENV";
    }

    const msgUint8 = new TextEncoder().encode(cleanKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return hashHex.substring(0, 6);
};

function Dashboard() {
    const [machines, setMachines] = useState([]);
    const [pendingMachines, setPendingMachines] = useState([]);
    const [fingerprints, setFingerprints] = useState({});
    const [approving, setApproving] = useState({});

    useEffect(() => {
        fetchServerTimezone(); // pre-fetch timezone on dashboard load

const fetchAll = async () => {
            try {
                const response = await axios.get('/api/frontend/machines');
                setMachines(response.data);
            } catch (error) {
                console.error("Error fetching machines", error);
            }

            try {
                const pendRes = await axios.get('/api/frontend/machines/pending');
                setPendingMachines(pendRes.data);

                const newFingerprints = {};
                for (const m of pendRes.data) {
                    newFingerprints[m.id] = await getFingerprint(m.public_key);
                }
                setFingerprints(newFingerprints);
            } catch (error) {
                console.error("Error fetching pending machines", error);
            }
        };

        fetchAll();
        const interval = setInterval(fetchAll, 10000);
        return () => clearInterval(interval);
    }, []);


    const handleApprove = async (id, status) => {
        setApproving(prev => ({...prev, [id]: true}));
        try {
            await axios.post(`/api/frontend/machines/${id}/approve`, { status });
            // Immediately remove from pending array in UI
            setPendingMachines(prev => prev.filter(m => m.id !== id));
            // Trigger machine fetch
            const response = await axios.get('/api/frontend/machines');
            setMachines(response.data);
        } catch(e) {
            console.error("Failed to approve/reject machine", e);
        }
        setApproving(prev => ({...prev, [id]: false}));
    };

    const handleDownloadAgent = async () => {
        try {
            const response = await axios.get('/api/frontend/agent/download', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'agent.zip');
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


            {pendingMachines.length > 0 && (
                <div className="mb-8 bg-yellow-50 rounded-lg p-6 border border-yellow-200 shadow-sm">
                    <h2 className="text-lg font-bold text-yellow-800 mb-4 flex items-center">
                        <AlertTriangle size={20} className="mr-2" /> Pending Agent Approvals
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-white rounded-lg overflow-hidden border">
                            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3">Hostname</th>
                                    <th className="px-4 py-3">OS</th>
                                    <th className="px-4 py-3">IP Address</th>
                                    <th className="px-4 py-3">Key Fingerprint</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-sm">
                                {pendingMachines.map(m => (
                                    <tr key={m.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900">{m.hostname}</td>
                                        <td className="px-4 py-3 text-gray-500">{m.os_name}</td>
                                        <td className="px-4 py-3 text-gray-500 font-mono">{m.ip_address}</td>
                                        <td className="px-4 py-3 text-gray-500 font-mono font-bold tracking-widest">{fingerprints[m.id] || "..."}</td>
                                        <td className="px-4 py-3 text-right space-x-2">
                                            <button
                                                onClick={() => handleApprove(m.id, 'approved')}
                                                disabled={approving[m.id]}
                                                className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => handleApprove(m.id, 'rejected')}
                                                disabled={approving[m.id]}
                                                className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700 disabled:opacity-50"
                                            >
                                                Reject
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {machines.map(machine => (
                    <Link to={`/machine/${machine.id}`} key={machine.id} className="block hover:shadow-xl transition-shadow duration-200">
                        <div className={`bg-white rounded-lg p-6 shadow-md border border-gray-200 ${!machine.is_online ? 'opacity-60 grayscale' : ''}`}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-3">
                                    <Monitor className={`text-blue-500 ${!machine.is_online ? 'text-gray-400' : ''}`} size={24} />
                                    <h2 className={`text-xl font-semibold ${!machine.is_online ? 'text-gray-500' : 'text-gray-800'}`}>{machine.hostname}</h2>
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
