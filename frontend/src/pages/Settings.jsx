import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Settings() {
    const [settings, setSettings] = useState({
        kopia_server_url: '',
        kopia_server_cert_fingerprint: '',
        kopia_repo_password: ''
    });
    const [message, setMessage] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await axios.get('/api/frontend/settings');
                const newSettings = { ...settings };
                response.data.forEach(item => {
                    if (newSettings[item.key] !== undefined) {
                        newSettings[item.key] = item.value;
                    }
                });
                setSettings(newSettings);
            } catch (error) {
                console.error("Error fetching settings", error);
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (e) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = Object.entries(settings).map(([key, value]) => ({ key, value }));
            await axios.post('/api/frontend/settings', payload);
            setMessage('Settings saved successfully.');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            console.error("Error saving settings", error);
            setMessage('Error saving settings.');
        }
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
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Global Settings</h1>
                <button
                    onClick={handleDownloadAgent}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md shadow transition-colors"
                >
                    Download Agent Script
                </button>
            </div>

            {message && (
                <div className={`p-4 mb-4 rounded ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {message}
                </div>
            )}

            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <h2 className="text-xl font-semibold mb-4 border-b pb-2">Kopia Server Connection</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Server URL</label>
                        <input type="text" name="kopia_server_url" value={settings.kopia_server_url} onChange={handleChange}
                            placeholder="e.g. https://kopia.local:51515"
                            className="w-full px-4 py-2 border rounded-md focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Server TLS Certificate Fingerprint</label>
                        <input type="text" name="kopia_server_cert_fingerprint" value={settings.kopia_server_cert_fingerprint} onChange={handleChange}
                            placeholder="SHA256 fingerprint"
                            className="w-full px-4 py-2 border rounded-md focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Repository Password</label>
                        <input type="password" name="kopia_repo_password" value={settings.kopia_repo_password} onChange={handleChange}
                            className="w-full px-4 py-2 border rounded-md focus:ring-blue-500" />
                    </div>
                    <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors">
                        Save Settings
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Settings;
