import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MachineDetails from './pages/MachineDetails';
import Settings from './pages/Settings';
import { Settings as SettingsIcon, Home, LogOut } from 'lucide-react';

const PrivateRoute = ({ children }) => {
    const { token } = useAuth();
    return token ? children : <Navigate to="/login" />;
};

import axios from 'axios';
import { useState, useEffect } from 'react';

const Navigation = () => {
    const { token, logout } = useAuth();
    const [systemVersion, setSystemVersion] = useState('');

    useEffect(() => {
        if (token) {
            axios.get('/api/frontend/version')
                .then(res => setSystemVersion(res.data.version))
                .catch(err => console.error("Error fetching version", err));
        }
    }, [token]);

    if (!token) return null;

    return (
        <nav className="bg-gray-800 text-white p-4 shadow-md">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
                <div className="flex items-center">
                    <div className="text-xl font-bold tracking-wider">HCMS</div>
                    {systemVersion && systemVersion !== 'unknown' && (
                        <span className="ml-3 text-xs text-gray-400 font-mono">v{systemVersion}</span>
                    )}
                </div>
                <div className="flex space-x-6">
                    <Link to="/" className="flex items-center hover:text-blue-300 transition-colors">
                        <Home size={18} className="mr-1"/> Dashboard
                    </Link>
                    <Link to="/settings" className="flex items-center hover:text-blue-300 transition-colors">
                        <SettingsIcon size={18} className="mr-1"/> Settings
                    </Link>
                    <button onClick={logout} className="flex items-center hover:text-red-300 transition-colors">
                        <LogOut size={18} className="mr-1"/> Logout
                    </button>
                </div>
            </div>
        </nav>
    );
};

function App() {
    return (
        <Router>
            <AuthProvider>
                <div className="min-h-screen bg-gray-50 flex flex-col">
                    <Navigation />
                    <main className="flex-grow">
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                            <Route path="/machine/:id" element={<PrivateRoute><MachineDetails /></PrivateRoute>} />
                            <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
                        </Routes>
                    </main>
                </div>
            </AuthProvider>
        </Router>
    );
}

export default App;
