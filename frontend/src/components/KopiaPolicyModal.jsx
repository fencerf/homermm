import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Save, Play } from 'lucide-react';
import { generateUUID } from '../utils/uuid';

function KopiaPolicyModal({ machineId, policy, onClose }) {
    const [retention, setRetention] = useState({
        keepHourly: 48,
        keepDaily: 7,
        keepWeekly: 4,
        keepMonthly: 6,
        keepAnnual: 3
    });
    const [schedulingPolicy, setSchedulingPolicy] = useState({
        intervalSeconds: 3600
    });
    const [ignoreRules, setIgnoreRules] = useState("");

    const [actionMessage, setActionMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (policy) {
            if (policy.retentionPolicy) {
                setRetention({
                    keepHourly: policy.retentionPolicy.keepHourly !== undefined ? policy.retentionPolicy.keepHourly : 48,
                    keepDaily: policy.retentionPolicy.keepDaily !== undefined ? policy.retentionPolicy.keepDaily : 7,
                    keepWeekly: policy.retentionPolicy.keepWeekly !== undefined ? policy.retentionPolicy.keepWeekly : 4,
                    keepMonthly: policy.retentionPolicy.keepMonthly !== undefined ? policy.retentionPolicy.keepMonthly : 6,
                    keepAnnual: policy.retentionPolicy.keepAnnual !== undefined ? policy.retentionPolicy.keepAnnual : 3,
                });
            }
            if (policy.schedulingPolicy) {
                setSchedulingPolicy({
                    intervalSeconds: policy.schedulingPolicy.intervalSeconds !== undefined ? policy.schedulingPolicy.intervalSeconds : 0,
                });
            }
            if (policy.filesPolicy && policy.filesPolicy.ignoreRules) {
                setIgnoreRules(policy.filesPolicy.ignoreRules.join('\n'));
            } else {
                setIgnoreRules('');
            }
        }
    }, [policy]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await axios.post(`/api/frontend/machines/${machineId}/tasks`, {
                task_type: "update_kopia_policy",
                payload: JSON.stringify({
                    path: policy.target?.path,
                    retentionPolicy: retention,
                    schedulingPolicy: schedulingPolicy,
                    filesPolicy: {
                        ignoreRules: ignoreRules.split('\n').map(line => line.trim()).filter(line => line)
                    }
                }),
                action_id: generateUUID()
            });
            setActionMessage("Policy update task queued!");
            setTimeout(() => {
                onClose(true); // pass true to indicate something changed (will trigger a machine refresh eventually)
            }, 1500);
        } catch (error) {
            console.error("Failed to save policy", error);
            setActionMessage("Error queuing policy update.");
            setIsSaving(false);
        }
    };

    const handleStartBackup = async () => {
        try {
            await axios.post(`/api/frontend/machines/${machineId}/tasks`, {
                task_type: "run_kopia_backup",
                payload: JSON.stringify({ path: policy.target?.path }),
                action_id: generateUUID()
            });
            setActionMessage("Backup task queued!");
            setTimeout(() => setActionMessage(""), 3000);
        } catch (error) {
            console.error("Failed to start backup", error);
            setActionMessage("Error queuing backup.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                    <h3 className="font-semibold text-lg text-gray-800">Edit Kopia Policy: {policy?.target?.path}</h3>
                    <button onClick={() => onClose(false)} className="text-gray-500 hover:text-gray-800"><X size={20}/></button>
                </div>

                <div className="p-6 flex-grow overflow-y-auto">
                    {actionMessage && (
                        <div className={`mb-4 p-3 rounded ${actionMessage.includes("Error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {actionMessage}
                        </div>
                    )}

                    <h4 className="font-medium text-gray-700 mb-4 border-b pb-2">Retention Policy</h4>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1" htmlFor="keepHourly">Keep Hourly</label>
                                <input
                                    id="keepHourly"
                                    name="keepHourly"
                                    type="number"
                                    className="w-full border rounded px-3 py-2"
                                    value={retention.keepHourly}
                                    onChange={e => setRetention({...retention, keepHourly: parseInt(e.target.value, 10) || 0})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1" htmlFor="keepDaily">Keep Daily</label>
                                <input
                                    id="keepDaily"
                                    name="keepDaily"
                                    type="number"
                                    className="w-full border rounded px-3 py-2"
                                    value={retention.keepDaily}
                                    onChange={e => setRetention({...retention, keepDaily: parseInt(e.target.value, 10) || 0})}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1" htmlFor="keepWeekly">Keep Weekly</label>
                                <input
                                    id="keepWeekly"
                                    name="keepWeekly"
                                    type="number"
                                    className="w-full border rounded px-3 py-2"
                                    value={retention.keepWeekly}
                                    onChange={e => setRetention({...retention, keepWeekly: parseInt(e.target.value, 10) || 0})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-600 mb-1" htmlFor="keepMonthly">Keep Monthly</label>
                                <input
                                    id="keepMonthly"
                                    name="keepMonthly"
                                    type="number"
                                    className="w-full border rounded px-3 py-2"
                                    value={retention.keepMonthly}
                                    onChange={e => setRetention({...retention, keepMonthly: parseInt(e.target.value, 10) || 0})}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-600 mb-1" htmlFor="keepAnnual">Keep Annual</label>
                            <input
                                id="keepAnnual"
                                name="keepAnnual"
                                type="number"
                                className="w-full border rounded px-3 py-2"
                                value={retention.keepAnnual}
                                onChange={e => setRetention({...retention, keepAnnual: parseInt(e.target.value, 10) || 0})}
                            />
                        </div>
                    </div>

                    <h4 className="font-medium text-gray-700 mb-4 mt-6 border-b pb-2">Scheduling</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-600 mb-1" htmlFor="intervalSeconds">Snapshot Interval (Seconds) - 0 to disable</label>
                            <input
                                id="intervalSeconds"
                                name="intervalSeconds"
                                type="number"
                                className="w-full border rounded px-3 py-2"
                                value={schedulingPolicy.intervalSeconds}
                                onChange={e => setSchedulingPolicy({intervalSeconds: parseInt(e.target.value, 10) || 0})}
                                placeholder="e.g. 3600 for 1 hour"
                            />
                        </div>
                    </div>

                    <h4 className="font-medium text-gray-700 mb-4 mt-6 border-b pb-2">Ignore Rules</h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-600 mb-1" htmlFor="ignoreRules">One rule per line (e.g. *.tmp, node_modules/)</label>
                            <textarea
                                id="ignoreRules"
                                name="ignoreRules"
                                className="w-full border rounded px-3 py-2 h-32 font-mono text-sm"
                                value={ignoreRules}
                                onChange={e => setIgnoreRules(e.target.value)}
                                placeholder="*.log&#10;node_modules/&#10;.cache/"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                     <button
                        onClick={handleStartBackup}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center transition-colors"
                     >
                        <Play size={16} className="mr-2" /> Start Backup Now
                     </button>

                    <div className="flex space-x-3">
                        <button onClick={() => onClose(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded flex items-center disabled:opacity-50"
                        >
                            <Save size={16} className="mr-2" /> Save Policy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default KopiaPolicyModal;
