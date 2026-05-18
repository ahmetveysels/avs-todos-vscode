import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    const provider = new AvsTodosProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('avs-todos-view', provider)
    );
}

class AvsTodosProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { 
            enableScripts: true, 
            localResourceRoots: [this._extensionUri] 
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        
        this._sendDataToWebview(webviewView);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'addTask': this._addTask(data.text, data.date, webviewView); break;
                case 'toggleTask': this._toggleTask(data.id, webviewView); break;
                case 'deleteTask': this._deleteTask(data.id, webviewView); break;
                case 'editTask': this._editTask(data.id, webviewView); break;
                case 'updateOrder': this._updateOrder(data.orders, webviewView); break;
                case 'openExternal': vscode.env.openExternal(vscode.Uri.parse(data.url)); break;
                case 'ready': this._sendDataToWebview(webviewView); break;
            }
        });
    }

    private _getFilePath(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        return folders ? path.join(folders[0].uri.fsPath, 'avstodos') : undefined;
    }

    private _readData(): any[] {
        const filePath = this._getFilePath();
        if (!filePath || !fs.existsSync(filePath)) return [];
        try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return []; }
    }

    private _writeData(data: any[]) {
        const filePath = this._getFilePath();
        if (filePath) fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    private _sendDataToWebview(webviewView: vscode.WebviewView) {
        webviewView.webview.postMessage({ type: 'loadTasks', tasks: this._readData() });
    }

    private _addTask(text: string, date: string, webviewView: vscode.WebviewView) {
        const tasks = this._readData();
        const now = new Date().toISOString();
        tasks.push({ 
            id: Date.now().toString(), 
            text, 
            date, 
            completed: false,
            createdAt: now,
            updatedAt: now,
            order: tasks.length 
        });
        this._writeData(tasks);
        this._sendDataToWebview(webviewView);
    }

    private _updateOrder(orders: {id: string, order: number}[], webviewView: vscode.WebviewView) {
        const tasks = this._readData();
        orders.forEach(o => {
            const task = tasks.find(t => t.id === o.id);
            if (task) task.order = o.order;
        });
        this._writeData(tasks);
    }

    private async _editTask(id: string, webviewView: vscode.WebviewView) {
        const tasks = this._readData();
        const task = tasks.find(t => t.id === id);
        if (!task) return;
        const newText = await vscode.window.showInputBox({ value: task.text, prompt: "Update task description" });
        if (newText !== undefined && newText.trim() !== "") {
            task.text = newText.trim();
            task.updatedAt = new Date().toISOString();
            this._writeData(tasks);
            this._sendDataToWebview(webviewView);
        }
    }

    private _toggleTask(id: string, webviewView: vscode.WebviewView) {
        const tasks = this._readData();
        const task = tasks.find(t => t.id === id);
        if (task) { 
            task.completed = !task.completed; 
            task.updatedAt = new Date().toISOString();
            this._writeData(tasks); 
            this._sendDataToWebview(webviewView); 
        }
    }

    private async _deleteTask(id: string, webviewView: vscode.WebviewView) {
        const tasks = this._readData();
        const task = tasks.find(t => t.id === id);
        const confirm = await vscode.window.showWarningMessage(`Delete "${task?.text}"?`, { modal: true }, "Delete");
        if (confirm === "Delete") {
            this._writeData(tasks.filter(t => t.id !== id));
            this._sendDataToWebview(webviewView);
        } else {
            this._sendDataToWebview(webviewView);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                :root { 
                    --accent: #6c5ce7; 
                    --accent-soft: rgba(108, 92, 231, 0.15);
                    --accent-glow: rgba(108, 92, 231, 0.25);
                    --success: #00b894; 
                    --danger: #ff6b6b;
                    --surface: rgba(255, 255, 255, 0.05); 
                    --surface-hover: rgba(255, 255, 255, 0.09);
                    --border: rgba(255, 255, 255, 0.08); 
                    --border-light: rgba(255, 255, 255, 0.15);
                    --text-main: var(--vscode-foreground, #e0e0e0); 
                    --text-sec: var(--vscode-descriptionForeground, #aaa); 
                    --radius-md: 10px;
                }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Inter', sans-serif; padding: 12px; color: var(--text-main); background: transparent; user-select: none; padding-bottom: 90px; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
                
                /* Scrollbar */
                ::-webkit-scrollbar { width: 5px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

                /* Controls Card */
                .controls { 
                    background: linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01));
                    border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 12px;
                }
                .control-row { display: flex; align-items: center; gap: 10px; }
                .sort-label { font-size: 10px; font-weight: 800; color: var(--accent); letter-spacing: 1px; }
                select { background: rgba(0,0,0,0.4); color: white; border: 1px solid var(--border); border-radius: 6px; font-size: 11px; padding: 5px; outline: none; flex: 1; cursor: pointer; }
                
                /* Checkbox Labels */
                .check-label { font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; opacity: 0.85; transition: 0.2s; color: var(--text-main); }
                .check-label:hover { opacity: 1; color: var(--accent); }
                .check-label input { cursor: pointer; accent-color: var(--accent); }

                /* Form Card */
                .add-form { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 15px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
                input[type="text"] { width: 100%; background: rgba(0,0,0,0.25); border: 1px solid var(--border-light); color: white; outline: none; padding: 9px 12px; border-radius: var(--radius-md); margin-bottom: 10px; font-family: inherit; transition: all 0.25s ease; }
                input[type="text"]:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
                .meta-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
                input[type="date"] { background: rgba(255,255,255,0.05); border: 1px solid var(--border-light); color: var(--text-main); font-size: 11.5px; padding: 6px 8px; border-radius: 6px; font-family: inherit; outline: none; }
                input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(var(--calendar-invert, 0)); cursor: pointer; transform: scale(1.2); }
                @media (prefers-color-scheme: dark) { :root { --calendar-invert: 1; } }
                .add-btn { background: linear-gradient(135deg, var(--accent), #8b5cf6); color: white; border: none; border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 11.5px; font-weight: 700; transition: all 0.25s ease; box-shadow: 0 2px 8px var(--accent-glow); }
                .add-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px var(--accent-glow); }

                /* Stats Bar */
                .stats-container { margin-bottom: 15px; padding: 0 4px; }
                .stats-text { display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; margin-bottom: 6px; color: var(--text-sec); text-transform: uppercase; }
                .progress-bg { height: 8px; background: rgba(255,255,255,0.05); border-radius: 10px; border: 1px solid var(--border); overflow: hidden; }
                .progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--accent), var(--success)); transition: width 0.4s ease; }

                /* Group Headers */
                .group-header { 
                    display: flex; align-items: center; justify-content: space-between;
                    font-size: 11px; font-weight: 800; text-transform: uppercase; 
                    margin: 16px 4px 8px 4px; padding: 4px 0; cursor: pointer; letter-spacing: 0.8px;
                }
                .group-header.overdue { color: var(--danger); }
                .group-header.today { color: var(--accent); }
                .group-header.future { color: var(--success); }
                .group-header.completed { color: var(--text-sec); opacity: 0.6; }
                
                .arrow-svg { width: 18px; height: 18px; fill: currentColor; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .collapsed .arrow-svg { transform: rotate(-90deg); }
                .collapsed + .group-content { display: none; }

                /* Task Cards */
                .task-card { 
                    background: var(--surface); 
                    border: 1px solid var(--border); 
                    border-left: 4px solid var(--card-indicator, var(--accent)); 
                    border-radius: var(--radius-md); 
                    padding: 12px; 
                    margin: 0 4px 10px 4px; 
                    display: flex; 
                    align-items: flex-start; 
                    gap: 12px; 
                    max-height: 200px;
                    cursor: grab; 
                    position: relative;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    transition: 
                        background 0.2s ease,
                        border-color 0.2s ease,
                        box-shadow 0.2s ease,
                        transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                        opacity 0.2s ease;
                }
                
                .task-overdue { --card-indicator: var(--danger); }
                .task-today { --card-indicator: var(--accent); }
                .task-future { --card-indicator: var(--success); }
                .task-completed { --card-indicator: rgba(255, 255, 255, 0.2); }

                .task-card:hover { 
                    background: var(--surface-hover); 
                    border-color: rgba(108, 92, 231, 0.4); 
                    border-left-color: var(--card-indicator); 
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25), 0 0 10px rgba(108, 92, 231, 0.15); 
                    transform: translateY(-1.5px);
                }
                
                .task-card.completed { 
                    opacity: 0.65; 
                    background: rgba(255, 255, 255, 0.02);
                    border-color: rgba(255, 255, 255, 0.05);
                    box-shadow: none; 
                }
                .task-card.completed:hover {
                    transform: none;
                    border-color: rgba(255, 255, 255, 0.1);
                    box-shadow: none;
                }
                
                /* Text Container */
                .content { flex: 1; min-width: 0; height: auto; }

                /* Task Text with Draw-in Line */
                .task-text { 
                    font-size: 12.5px; 
                    font-weight: 500; 
                    line-height: 1.5;
                    white-space: pre-wrap; 
                    word-break: break-word; 
                    overflow: visible; 
                    display: block; 
                    height: auto; 
                    position: relative;
                    transition: color 0.25s ease;
                }
                .task-text::after {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 50%;
                    width: 0;
                    height: 1.5px;
                    background: var(--text-sec);
                    transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    transform: translateY(-50%);
                    opacity: 0.6;
                }
                .completed .task-text { color: var(--text-sec); }
                .completed .task-text::after { width: 100%; }
                
                .task-date { font-size: 9.5px; color: var(--text-sec); margin-top: 4px; display: block; }
                
                /* Checkbox Pop/Bounce */
                .checkbox { 
                    width: 18px; 
                    height: 18px; 
                    border-radius: 50%; 
                    border: 2px solid rgba(255,255,255,0.3); 
                    flex-shrink: 0; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    margin-top: 1.5px; 
                    transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .task-card:not(.completed):hover .checkbox { transform: scale(1.1); border-color: var(--card-indicator); }
                .completed .checkbox { 
                    background: var(--success); 
                    border-color: var(--success); 
                    box-shadow: 0 0 8px rgba(0, 184, 148, 0.3);
                    animation: checkboxBounce 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.5) both;
                }
                .completed .checkbox::after { content: '✓'; color: white; font-size: 11px; font-weight: bold; }
                
                @keyframes checkboxBounce {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.25); }
                    100% { transform: scale(1); }
                }

                /* Actions Area (EN SAĞA SABİTLENDİ) */
                .actions { 
                    display: flex; 
                    gap: 10px; 
                    opacity: 0; 
                    transition: 0.2s; 
                    align-self: flex-start; 
                    margin-top: 1px; 
                    margin-left: auto; /* Yazı kısa olsa dahi butonları en sağa kilitler */
                    flex-shrink: 0;    /* Butonların genişliğinin daralmasını önler */
                }
                .task-card:hover .actions { opacity: 1; }
                .action-btn { cursor: pointer; font-size: 14px; opacity: 0.6; padding: 2px 4px; transition: 0.2s; }
                .action-btn:hover { opacity: 1; transform: scale(1.2); }

                /* ═══════════════ MOTION GRAPHICS SYSTEM ═══════════════ */
                @keyframes advancedEnter {
                    0% { 
                        opacity: 0; 
                        transform: translateX(-40px) scale(0.96); 
                        filter: blur(4px); 
                        box-shadow: 0 0 0 rgba(108, 92, 231, 0);
                    }
                    70% {
                        transform: translateX(4px) scale(1.01);
                        filter: blur(0);
                        box-shadow: 0 0 15px var(--accent-glow);
                    }
                    100% { 
                        opacity: 1; 
                        transform: translateX(0) scale(1); 
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    }
                }
                .animate-enter {
                    animation: advancedEnter 0.38s cubic-bezier(0.23, 1, 0.32, 1) both;
                }

                .animate-toggle {
                    animation: checkboxBounce 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
                }

                @keyframes textFlash {
                    0% { background: transparent; }
                    50% { background: var(--accent-soft); }
                    100% { background: transparent; }
                }
                .animate-update {
                    animation: textFlash 0.4s ease-in-out both;
                }

                @keyframes advancedExit {
                    0% {
                        transform: translateX(0);
                        opacity: 1;
                        max-height: 120px;
                        margin-bottom: 10px;
                        padding: 12px;
                    }
                    40% {
                        transform: translateX(110%);
                        opacity: 0;
                        max-height: 120px;
                        margin-bottom: 10px;
                        padding: 12px;
                    }
                    100% {
                        transform: translateX(110%);
                        opacity: 0;
                        max-height: 0;
                        margin-bottom: 0;
                        padding: 0;
                        border-top: none;
                        border-bottom: none;
                    }
                }
                .task-card.animate-exit {
                    animation: advancedExit 0.35s cubic-bezier(0.55, 0.085, 0.68, 0.53) both !important;
                    pointer-events: none;
                }

                /* Empty State */
                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 80px 20px 40px 20px; 
                    text-align: center;
                    animation: fadeIn 0.4s ease-in-out both;
                }
                .empty-icon {
                    font-size: 42px;
                    margin-bottom: 12px;
                    display: inline-block;
                    animation: float 3s ease-in-out infinite;
                }
                .empty-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-main);
                    margin-bottom: 4px;
                }
                .empty-desc {
                    font-size: 11px;
                    color: var(--text-sec);
                    max-width: 180px;
                    line-height: 1.4;
                }

                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-6px); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                /* Footer Card */
                .footer-container { position: fixed; bottom: 12px; left: 12px; right: 12px; z-index: 1000; }
                .footer-card { 
                    background: linear-gradient(135deg, var(--accent-soft), rgba(255, 255, 255, 0.02)); 
                    border: 1px solid var(--accent); border-radius: 12px; padding: 10px; text-align: center; 
                    backdrop-filter: blur(12px); cursor: pointer; transition: 0.3s; 
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                }
                .footer-card:hover { transform: translateY(-2px); box-shadow: 0 0 15px var(--accent-soft); }
                .footer-icon { font-size: 14px; animation: pulse 2s infinite ease-in-out; }
                .footer-link { color: var(--text-main); text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }

                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.2); opacity: 0.7; }
                    100% { transform: scale(1); opacity: 1; }
                }
            </style>
        </head>
        <body>
            <div class="controls">
                <div class="control-row">
                    <span class="sort-label">SORT BY</span>
                    <select id="sortSelect" onchange="applySort()">
                        <option value="custom" selected>Custom Order</option>
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="az">A-Z</option>
                        <option value="za">Z-A</option>
                    </select>
                </div>
                <div class="control-row" style="justify-content: space-between;">
                    <label class="check-label"><input type="checkbox" id="groupCheck" onchange="applySort()" checked> Grouping</label>
                    <label class="check-label"><input type="checkbox" id="moveDoneCheck" onchange="applySort()" checked> Move Done</label>
                </div>
            </div>

            <div class="add-form">
                <input type="text" id="taskInput" placeholder="Plan a new task..." onkeypress="if(event.key==='Enter')addTask()">
                <div class="meta-row">
                    <input type="date" id="dateInput">
                    <button class="add-btn" onclick="addTask()">Add</button>
                </div>
            </div>

            <div class="stats-container">
                <div class="stats-text"><span id="taskRatio">0/0 Tasks</span><span id="taskPercent" style="color:var(--accent)">(0%)</span></div>
                <div class="progress-bg"><div class="progress-fill" id="progressBar"></div></div>
            </div>

            <div id="taskList"></div>

            <div class="footer-container">
                <div class="footer-card" onclick="openSite()">
                    <span class="footer-icon">🌐</span>
                    <span class="footer-link">ahmetveysel.com</span>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let allTasks = [];
                let collapsedGroups = new Set();
                let previousTasksMap = new Map();

                document.getElementById('dateInput').valueAsDate = new Date();
                window.addEventListener('message', e => { 
                    if (e.data.type === 'loadTasks') { 
                        allTasks = e.data.tasks; 
                        updateProgress(); 
                        applySort(); 
                        previousTasksMap = new Map(allTasks.map(t => [t.id, { completed: t.completed, text: t.text, date: t.date }]));
                    } 
                });

                function updateProgress() {
                    const total = allTasks.length;
                    const done = allTasks.filter(t => t.completed).length;
                    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
                    document.getElementById('taskRatio').innerText = done + '/' + total + ' Tasks';
                    document.getElementById('taskPercent').innerText = '(' + percent + '%)';
                    document.getElementById('progressBar').style.width = percent + '%';
                }

                function applySort() {
                    const container = document.getElementById('taskList');
                    container.innerHTML = '';

                    if (allTasks.length === 0) {
                        container.innerHTML = \`
                            <div class="empty-state">
                                <span class="empty-icon">🎯</span>
                                <div class="empty-title">No Tasks Planned</div>
                                <div class="empty-desc">Start planning your goals by adding a new task above!</div>
                            </div>\`;
                        return;
                    }

                    const sortMode = document.getElementById('sortSelect').value;
                    const moveDone = document.getElementById('moveDoneCheck').checked;
                    const groupOn = document.getElementById('groupCheck').checked;
                    let tasks = [...allTasks].sort((a, b) => {
                        if (sortMode === 'custom') return a.order - b.order;
                        if (sortMode === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
                        if (sortMode === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
                        if (sortMode === 'az') return a.text.localeCompare(b.text);
                        return b.text.localeCompare(a.text);
                    });

                    if (groupOn) {
                        const today = new Date().toISOString().split('T')[0];
                        const g = { overdue: [], today: [], future: [], done: [] };
                        tasks.forEach(t => {
                            if (moveDone && t.completed) g.done.push(t);
                            else if (t.date < today) g.overdue.push(t);
                            else if (t.date === today) g.today.push(t);
                            else g.future.push(t);
                        });
                        renderGroup('Overdue', g.overdue, 'overdue');
                        renderGroup('Today', g.today, 'today');
                        renderGroup('Future', g.future, 'future');
                        if (moveDone) renderGroup('Completed', g.done, 'completed');
                    } else {
                        let final = moveDone ? tasks.sort((a,b) => a.completed - b.completed) : tasks;
                        final.forEach(t => container.innerHTML += createCard(t));
                    }
                    initDragAndDrop();
                }

                function renderGroup(label, list, id) {
                    if (list.length === 0) return;
                    const isCollapsed = collapsedGroups.has(id);
                    const header = document.createElement('div');
                    header.className = 'group-header ' + id + (isCollapsed ? ' collapsed' : '');
                    header.onclick = () => toggleGroup(id);
                    header.innerHTML = \`
                        <span>\${label} (\${list.length})</span>
                        <svg class="arrow-svg" viewBox="0 0 16 16">
                            <path d="M4.646 6.646a.5.5 0 0 1 .708 0L8 9.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z"/>
                        </svg>\`;
                    
                    const content = document.createElement('div');
                    content.className = 'group-content';
                    list.forEach(t => content.innerHTML += createCard(t));

                    document.getElementById('taskList').appendChild(header);
                    document.getElementById('taskList').appendChild(content);
                }

                function toggleGroup(id) {
                    if (collapsedGroups.has(id)) collapsedGroups.delete(id);
                    else collapsedGroups.add(id);
                    applySort();
                }

                function createCard(t) {
                    const today = new Date().toISOString().split('T')[0];
                    let typeClass = 'task-future';
                    if (t.completed) typeClass = 'task-completed';
                    else if (t.date < today) typeClass = 'task-overdue';
                    else if (t.date === today) typeClass = 'task-today';

                    let animClass = '';
                    if (previousTasksMap.size > 0) {
                        const prev = previousTasksMap.get(t.id);
                        if (!prev) {
                            animClass = ' animate-enter';
                        } else if (prev.completed !== t.completed) {
                            animClass = ' animate-toggle';
                        } else if (prev.text !== t.text || prev.date !== t.date) {
                            animClass = ' animate-update';
                        }
                    }

                    return \`
                        <div class="task-card \${typeClass} \${t.completed ? 'completed' : ''}\${animClass}" draggable="true" data-id="\${t.id}" onclick="toggleTask('\${t.id}')">
                            <div class="checkbox"></div>
                            <div class="content"><span class="task-text">\${t.text}</span><span class="task-date">\${t.date}</span></div>
                            <div class="actions">
                                <span class="action-btn" style="color:var(--vscode-editorInfo-foreground)" onclick="event.stopPropagation(); editTask('\${t.id}')">✎</span>
                                <span class="action-btn" style="color:var(--vscode-errorForeground)" onclick="event.stopPropagation(); deleteTask('\${t.id}')">×</span>
                            </div>
                        </div>\`;
                }

                function initDragAndDrop() {
                    const container = document.getElementById('taskList');
                    document.querySelectorAll('.task-card').forEach(card => {
                        card.addEventListener('dragstart', () => card.classList.add('dragging'));
                        card.addEventListener('dragend', () => {
                            card.classList.remove('dragging');
                            const orders = [...container.querySelectorAll('.task-card')].map((el, i) => ({ id: el.dataset.id, order: i }));
                            vscode.postMessage({ type: 'updateOrder', orders });
                        });
                    });
                    container.addEventListener('dragover', e => {
                        e.preventDefault();
                        const dragging = document.querySelector('.dragging');
                        const after = [...container.querySelectorAll('.task-card:not(.dragging)')].find(el => e.clientY <= el.offsetTop + el.offsetHeight / 2);
                        if (dragging && dragging.parentNode) {
                            after ? dragging.parentNode.insertBefore(dragging, after) : dragging.parentNode.appendChild(dragging);
                        }
                    });
                }

                function addTask() { 
                    const t = document.getElementById('taskInput').value.trim(); 
                    const d = document.getElementById('dateInput').value;
                    if (t) vscode.postMessage({ type: 'addTask', text: t, date: d }); 
                    document.getElementById('taskInput').value = '';
                }
                function toggleTask(id) { vscode.postMessage({ type: 'toggleTask', id }); }
                function editTask(id) { vscode.postMessage({ type: 'editTask', id }); }
                
                function deleteTask(id) { 
                    const card = document.querySelector(\`.task-card[data-id="\${id}"]\`);
                    if (card) {
                        card.classList.add('animate-exit');
                    }
                    setTimeout(() => {
                        vscode.postMessage({ type: 'deleteTask', id }); 
                    }, 350);
                }
                
                function openSite() { vscode.postMessage({ type: 'openExternal', url: 'https://ahmetveysel.com' }); }
                vscode.postMessage({ type: 'ready' });
            </script>
        </body>
        </html>`;
    }
}