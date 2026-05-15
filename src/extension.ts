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
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <style>
                :root { 
                    --accent: #6c5ce7; --accent-soft: rgba(108, 92, 231, 0.15);
                    --success: #00b894; --danger: #ff6b6b;
                    --surface: rgba(255, 255, 255, 0.04); --border: rgba(255, 255, 255, 0.1); 
                    --text-main: var(--vscode-foreground); --text-sec: var(--vscode-descriptionForeground); 
                }
                * { box-sizing: border-box; }
                body { font-family: 'Inter', sans-serif; padding: 12px; color: var(--text-main); background: transparent; user-select: none; padding-bottom: 90px; overflow-x: hidden; }
                
                /* 1. Restored & Improved Controls Card */
                .controls { 
                    background: linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01));
                    border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 12px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 12px;
                }
                .control-row { display: flex; align-items: center; gap: 10px; }
                .sort-label { font-size: 10px; font-weight: 800; color: var(--accent); letter-spacing: 1px; }
                select { background: rgba(0,0,0,0.4); color: white; border: 1px solid var(--border); border-radius: 6px; font-size: 11px; padding: 5px; outline: none; flex: 1; cursor: pointer; }
                
                /* 4. Beautiful Checkbox Labels */
                .check-label { font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; opacity: 0.85; transition: 0.2s; color: var(--text-main); }
                .check-label:hover { opacity: 1; color: var(--accent); }
                .check-label input { cursor: pointer; accent-color: var(--accent); }

                /* Form Card */
                .add-form { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 15px; }
                input[type="text"] { width: 100%; background: rgba(0,0,0,0.25); border: 1px solid var(--border); color: white; outline: none; padding: 8px; border-radius: 6px; margin-bottom: 10px; }
                input[type="date"] { background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text-main); font-size: 11px; padding: 4px 8px; border-radius: 6px; }
                input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(var(--calendar-invert, 0)); cursor: pointer; transform: scale(1.3); }
                @media (prefers-color-scheme: dark) { :root { --calendar-invert: 1; } }
                .add-btn { background: var(--accent); color: white; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 11px; font-weight: 700; transition: 0.2s; }

                /* Stats Bar */
                .stats-container { margin-bottom: 15px; padding: 0 4px; }
                .stats-text { display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; margin-bottom: 6px; color: var(--text-sec); text-transform: uppercase; }
                .progress-bg { height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; border: 1px solid var(--border); overflow: hidden; }
                .progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--accent), var(--success)); transition: width 0.6s ease; }

                /* 2 & 3. Group Headers (Tighter spacing & Larger Arrows) */
                .group-header { 
                    display: flex; align-items: center; justify-content: space-between;
                    font-size: 11px; font-weight: 800; text-transform: uppercase; 
                    margin: 12px 4px 8px 4px; padding: 4px 0; cursor: pointer; letter-spacing: 0.8px;
                }
                .group-header.overdue { color: var(--danger); }
                .group-header.today { color: var(--accent); }
                .group-header.future { color: var(--success); }
                .group-header.completed { color: var(--text-sec); opacity: 0.6; }
                
                .arrow-svg { 
                    width: 18px; height: 18px; fill: currentColor; 
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
                }
                .collapsed .arrow-svg { transform: rotate(-90deg); }
                .collapsed + .group-content { display: none; }

                /* 1. Fixed Card Design (No overflow) */
                .task-card { 
                    background: var(--surface); border: 1px solid var(--border); border-radius: 10px; 
                    padding: 12px; margin: 0 4px 8px 4px; display: flex; align-items: center; gap: 12px; 
                    transition: 0.2s ease; cursor: grab; position: relative;
                }
                .task-card:hover { border-color: var(--accent); background: rgba(255,255,255,0.07); box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
                .task-card.completed { opacity: 0.4; }
                .task-card.completed .task-text { text-decoration: line-through; }
                
                .checkbox { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
                .completed .checkbox { background: var(--accent); border-color: var(--accent); }
                .completed .checkbox::after { content: '✓'; color: white; font-size: 11px; font-weight: bold; }
                .content { flex: 1; min-width: 0; }
                .task-text { font-size: 13px; font-weight: 500; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .task-date { font-size: 9px; color: var(--text-sec); margin-top: 3px; }
                .actions { display: flex; gap: 10px; opacity: 0; transition: 0.2s; }
                .task-card:hover .actions { opacity: 1; }
                .action-btn { cursor: pointer; font-size: 14px; opacity: 0.6; padding: 4px; transition: 0.2s; }
                .action-btn:hover { opacity: 1; transform: scale(1.2); }

                /* 5. Restored Footer Card with Animated Icon */
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

                document.getElementById('dateInput').valueAsDate = new Date();
                window.addEventListener('message', e => { 
                    if (e.data.type === 'loadTasks') { allTasks = e.data.tasks; updateProgress(); applySort(); } 
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

                    const container = document.getElementById('taskList');
                    container.innerHTML = '';

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
                    return \`
                        <div class="task-card \${t.completed ? 'completed' : ''}" draggable="true" data-id="\${t.id}" onclick="toggleTask('\${t.id}')">
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
                function deleteTask(id) { vscode.postMessage({ type: 'deleteTask', id }); }
                function openSite() { vscode.postMessage({ type: 'openExternal', url: 'https://ahmetveysel.com' }); }
                vscode.postMessage({ type: 'ready' });
            </script>
        </body>
        </html>`;
    }
}