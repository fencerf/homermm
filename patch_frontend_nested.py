import re

with open('frontend/src/pages/MachineDetails.jsx', 'r') as f:
    content = f.read()

# Replace TaskFolder and MachineDetails logic with a nested tree structure
task_folder_comp_old = """const TaskFolder = ({ folderName, items, onRun, onDelete, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border border-gray-200 mb-2 rounded overflow-hidden">
            <div
                className="bg-gray-100 px-4 py-3 flex items-center cursor-pointer hover:bg-gray-200 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                {isOpen ? <ChevronDown size={18} className="mr-2 text-gray-600" /> : <ChevronRight size={18} className="mr-2 text-gray-600" />}
                <Folder size={18} className="mr-2 text-blue-500" />
                <span className="font-semibold text-gray-800 text-sm">{folderName}</span>
                <span className="ml-auto text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{items.length} tasks</span>
            </div>
            {isOpen && (
                <div className="bg-white overflow-x-auto">
                    <table className="min-w-full text-left text-sm whitespace-nowrap">
                        <thead className="uppercase tracking-wider border-b-2 border-gray-200 bg-gray-50">
                            <tr>
                                <th className="px-4 py-2 font-medium text-gray-500 w-1/3">Task Name</th>
                                <th className="px-4 py-2 font-medium text-gray-500 w-1/4">Schedule</th>
                                <th className="px-4 py-2 font-medium text-gray-500 w-1/4">Command</th>
                                <th className="px-4 py-2 font-medium text-gray-500 w-1/6">Controls</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((task, idx) => (
                                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium text-gray-900">{task.shortName}</td>
                                    <td className="px-4 py-2 text-gray-600">{task.schedule}</td>
                                    <td className="px-4 py-2 text-gray-500 font-mono text-xs truncate max-w-[200px]" title={task.command}>{task.command}</td>
                                    <td className="px-4 py-2 space-x-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onRun(task.task_name); }}
                                            disabled={disabled}
                                            className="text-blue-600 hover:text-blue-900 text-xs font-semibold px-2 py-1 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50"
                                        >
                                            Run Now
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDelete(task.task_name); }}
                                            disabled={disabled}
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
            )}
        </div>
    );
};"""

task_folder_comp_new = """const TaskFolder = ({ node, onRun, onDelete, disabled, level = 0 }) => {
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
};"""

content = content.replace(task_folder_comp_old, task_folder_comp_new)

# Update the parsing logic
search_str = """                            // Group tasks by folder (everything before the last backslash)
                            const flatTasks = [];
                            const folders = {};

                            scheduledTasks.forEach(task => {
                                const name = task.task_name || "";
                                // Check if it looks like a Windows path (starts with \\ or contains \\)
                                if (name.includes('\\\\')) {
                                    const lastSlash = name.lastIndexOf('\\\\');
                                    let folderPath = name.substring(0, lastSlash);
                                    if (folderPath === "") folderPath = "\\\\"; // Root folder
                                    const shortName = name.substring(lastSlash + 1);

                                    if (!folders[folderPath]) {
                                        folders[folderPath] = [];
                                    }
                                    folders[folderPath].push({ ...task, shortName });
                                } else {
                                    // Linux cron jobs or other flat tasks
                                    flatTasks.push({ ...task, shortName: name });
                                }
                            });

                            // Sort folders alphabetically
                            const sortedFolderKeys = Object.keys(folders).sort();"""

replace_str = """                            // Build nested tree structure for hierarchical tasks
                            const flatTasks = [];
                            const tree = { name: "Root", children: {}, tasks: [] };

                            scheduledTasks.forEach(task => {
                                const name = task.task_name || "";
                                if (name.includes('\\\\')) {
                                    const parts = name.split('\\\\').filter(p => p !== "");

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
                            });"""

content = content.replace(search_str, replace_str)


search_str2 = """                                    {/* Render Windows Task Folders */}
                                    {sortedFolderKeys.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Windows Task Library</h3>
                                            {sortedFolderKeys.map(folderPath => (
                                                <TaskFolder
                                                    key={folderPath}
                                                    folderName={folderPath}
                                                    items={folders[folderPath]}
                                                    onRun={handleRunScheduledTask}
                                                    onDelete={handleDeleteScheduledTask}
                                                    disabled={activeTasks.length > 0}
                                                />
                                            ))}
                                        </div>
                                    )}"""

replace_str2 = """                                    {/* Render Windows Task Tree */}
                                    {(Object.keys(tree.children || {}).length > 0 || tree.tasks.length > 0) && (
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Windows Task Library</h3>
                                            <TaskFolder
                                                node={{...tree, name: "\\\\ (Root)"}}
                                                onRun={handleRunScheduledTask}
                                                onDelete={handleDeleteScheduledTask}
                                                disabled={activeTasks.length > 0}
                                            />
                                        </div>
                                    )}"""

content = content.replace(search_str2, replace_str2)

with open('frontend/src/pages/MachineDetails.jsx', 'w') as f:
    f.write(content)
