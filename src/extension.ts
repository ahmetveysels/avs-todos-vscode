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
        const newText = await vscode.window.showInputBox({ 
            value: task.text, 
            prompt: "Update task description" 
        });
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
        const confirm = await vscode.window.showWarningMessage(
            `Confirm deletion: "${task?.text}"?`,
            { modal: true },
            "Delete"
        );
        if (confirm === "Delete") {
            const filteredTasks = tasks.filter(t => t.id !== id);
            this._writeData(filteredTasks);
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
                    --success: #00b894;
                    --surface: rgba(255, 255, 255, 0.04); 
                    --border: rgba(255, 255, 255, 0.1); 
                    --text-main: var(--vscode-foreground);
                    --text-sec: var(--vscode-descriptionForeground); 
                }
                body { font-family: 'Inter', sans-serif; padding: 12px; color: var(--text-main); background: transparent; user-select: none; padding-bottom: 80px; }
                
                .controls { display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px; background: var(--surface); padding: 10px; border-radius: 10px; border: 1px solid var(--border); }
                .control-row { display: flex; align-items: center; gap: 8px; }
                .sort-label { font-size: 11px; font-weight: 600; opacity: 0.8; }
                select { background: rgba(0,0,0,0.3); color: white; border: 1px solid var(--border); border-radius: 4px; font-size: 11px; padding: 3px; outline: none; flex: 1; cursor: pointer; }
                .check-label { font-size: 10px; display: flex; align-items: center; gap: 4px; cursor: pointer; }

                .add-form { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 12px; }
                input[type="text"] { width: 100%; background: rgba(0,0,0,0.2); border: 1px solid var(--border); color: white; outline: none; padding: 8px; border-radius: 6px; box-sizing: border-box; margin-bottom: 10px; }
                .meta-row { display: flex; justify-content: space-between; align-items: center; }
                input[type="date"] { background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text-main); font-size: 11px; padding: 4px 8px; border-radius: 6px; outline: none; }
                input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(var(--calendar-invert, 0)); cursor: pointer; transform: scale(1.4); }
                @media (prefers-color-scheme: dark) { :root { --calendar-invert: 1; } }
                .add-btn { background: var(--accent); color: white; border: none; border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 11px; font-weight: 700; }

                /* ──────────────── PROGRESS BAR ──────────────── */
                .stats-container { margin-bottom: 20px; padding: 0 4px; }
                .stats-text { display: flex; justify-content: space-between; align-items: baseline; font-size: 10px; font-weight: 700; margin-bottom: 6px; color: var(--text-sec); letter-spacing: 0.5px; }
                .stats-percent { color: var(--accent); font-size: 12px; }
                .progress-bg { height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
                .progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg, var(--accent) 0%, var(--success) 100%); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px var(--accent-soft); }

                .group-header { font-size: 10px; font-weight: 800; text-transform: uppercase; margin: 15px 0 8px; color: var(--text-sec); opacity: 0.6; letter-spacing: 0.5px; }
                .task-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; transition: 0.3s; cursor: grab; }
                .task-card:hover { border-color: var(--accent); background: rgba(255,255,255,0.07); transform: translateX(2px); }
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
                .action-btn { cursor: pointer; font-size: 14px; opacity: 0.6; transition: 0.1s; padding: 4px; }

                .footer-container { position: fixed; bottom: 12px; left: 12px; right: 12px; z-index: 1000; }
                .footer-card { background: linear-gradient(135deg, var(--accent-soft), rgba(255, 255, 255, 0.02)); border: 1px solid var(--accent); border-radius: 12px; padding: 10px; text-align: center; backdrop-filter: blur(12px); cursor: pointer; transition: 0.3s; display: flex; align-items: center; justify-content: center; gap: 8px; }
                .footer-card:hover { background: linear-gradient(135deg, var(--accent), var(--accent-soft)); transform: translateY(-2px); }
                .footer-link { color: var(--text-main); text-decoration: none; font-size: 12px; font-weight: 700; }
            </style>
        </head>
        <body>
            <div class="controls">
                <div class="control-row">
                    <span class="sort-label">Sort By:</span>
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
                    <label class="check-label"><input type="checkbox" id="moveDoneCheck" onchange="applySort()" checked> Done to Bottom</label>
                </div>
            </div>

            <div class="add-form">
                <input type="text" id="taskInput" placeholder="Plan your next step..." onkeypress="if(event.key==='Enter')addTask()">
                <div class="meta-row">
                    <input type="date" id="dateInput">
                    <button class="add-btn" onclick="addTask()">Add Task</button>
                </div>
            </div>

            <div class="stats-container" id="statsArea">
                <div class="stats-text">
                    <span id="taskRatio">0/0 Tasks</span>
                    <span class="stats-percent" id="taskPercent">(0%)</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill" id="progressBar"></div>
                </div>
            </div>

            <div id="taskList"></div>

            <div class="footer-container">
                <div class="footer-card" onclick="openSite()">
                    <span class="footer-link">ahmetveysel.com</span>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let allTasks = [];
                document.getElementById('dateInput').valueAsDate = new Date();

                window.addEventListener('message', e => { 
                    if (e.data.type === 'loadTasks') { 
                        allTasks = e.data.tasks; 
                        updateProgress();
                        applySort(); 
                    } 
                });

                function updateProgress() {
                    const total = allTasks.length;
                    const done = allTasks.filter(t => t.completed).length;
                    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
                    
                    document.getElementById('taskRatio').innerText = \`\${done}/\${total} Tasks\`;
                    document.getElementById('taskPercent').innerText = \`(\${percent}%)\`;
                    document.getElementById('progressBar').style.width = \`\${percent}%\`;
                }

                function addTask() {
                    const el = document.getElementById('taskInput');
                    const text = el.value.trim();
                    const date = document.getElementById('dateInput').value;
                    if (text) { vscode.postMessage({ type: 'addTask', text, date }); el.value = ''; }
                }

                function applySort() {
                    const sortMode = document.getElementById('sortSelect').value;
                    const moveDone = document.getElementById('moveDoneCheck').checked;
                    const groupOn = document.getElementById('groupCheck').checked;
                    let tasks = [...allTasks];
                    tasks.sort((a, b) => {
                        if (sortMode === 'custom') return a.order - b.order;
                        if (sortMode === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
                        if (sortMode === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
                        if (sortMode === 'az') return a.text.localeCompare(b.text);
                        if (sortMode === 'za') return b.text.localeCompare(a.text);
                        return 0;
                    });
                    const container = document.getElementById('taskList');
                    container.innerHTML = '';
                    if (groupOn) {
                        const today = new Date().toISOString().split('T')[0];
                        const groups = { overdue: [], today: [], future: [] };
                        const done = [];
                        tasks.forEach(t => {
                            if (moveDone && t.completed) done.push(t);
                            else if (t.date < today) groups.overdue.push(t);
                            else if (t.date === today) groups.today.push(t);
                            else groups.future.push(t);
                        });
                        renderGroup('Overdue', groups.overdue);
                        renderGroup('Today', groups.today);
                        renderGroup('Future', groups.future);
                        if (moveDone) renderGroup('Completed', done);
                    } else {
                        let final = moveDone ? tasks.sort((a,b) => a.completed - b.completed) : tasks;
                        final.forEach(t => container.innerHTML += createCard(t));
                    }
                    initDragAndDrop();
                }

                function renderGroup(lbl, list) {
                    if (list.length === 0) return;
                    document.getElementById('taskList').innerHTML += \`<div class="group-header">\${lbl}</div>\`;
                    list.forEach(t => document.getElementById('taskList').innerHTML += createCard(t));
                }

                function createCard(t) {
                    return \`
                        <div class="task-card \${t.completed ? 'completed' : ''}" draggable="true" data-id="\${t.id}" onclick="toggleTask('\${t.id}')">
                            <div class="checkbox"></div>
                            <div class="content">
                                <span class="task-text">\${t.text}</span>
                                <span class="task-date">\${t.date}</span>
                            </div>
                            <div class="actions">
                                <span class="action-btn" style="color:var(--vscode-editorInfo-foreground)" onclick="event.stopPropagation(); editTask('\${t.id}')">✎</span>
                                <span class="action-btn" style="color:var(--vscode-errorForeground)" onclick="event.stopPropagation(); deleteTask('\${t.id}')">×</span>
                            </div>
                        </div>\`;
                }

                function initDragAndDrop() {
                    const cards = document.querySelectorAll('.task-card');
                    const container = document.getElementById('taskList');
                    cards.forEach(card => {
                        card.addEventListener('dragstart', () => card.classList.add('dragging'));
                        card.addEventListener('dragend', () => {
                            card.classList.remove('dragging');
                            const newOrders = [...container.querySelectorAll('.task-card')].map((el, i) => ({ id: el.dataset.id, order: i }));
                            vscode.postMessage({ type: 'updateOrder', orders: newOrders });
                        });
                    });
                    container.addEventListener('dragover', e => {
                        e.preventDefault();
                        const dragging = document.querySelector('.dragging');
                        const afterElement = [...container.querySelectorAll('.task-card:not(.dragging)')].find(el => e.clientY <= el.offsetTop + el.offsetHeight / 2);
                        afterElement ? container.insertBefore(dragging, afterElement) : container.appendChild(dragging);
                    });
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