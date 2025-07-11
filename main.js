// main.js (Versione COMPLETA e AGGIORNATA)

const { app, BrowserWindow, ipcMain, dialog, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

// Classe Store per gestire le impostazioni
class Store {
    constructor(path, defaults) {
        this.path = path;
        this.data = this.parseDataFile(this.path, defaults);
    }
    get(key) { return this.data[key]; }
    set(key, val) {
        this.data[key] = val;
        fs.writeFileSync(this.path, JSON.stringify(this.data));
    }
    parseDataFile(filePath, defaults) {
        try {
            return JSON.parse(fs.readFileSync(filePath));
        } catch (error) {
            return defaults;
        }
    }
}

const store = new Store(path.join(app.getPath('userData'), 'settings.json'), {
    promptsPath: null,
    zoomLevel: 'medium',
});

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true,
            nodeIntegration: false,
        },
        ...(process.platform === 'darwin' && {
            titleBarStyle: 'hidden',
            trafficLightPosition: { x: 15, y: 15 },
        }),
    });

    mainWindow.setMenu(null);

    const promptsPath = store.get('promptsPath');
    if (promptsPath && fs.existsSync(promptsPath)) {
        mainWindow.loadFile(path.join(__dirname, 'src/html/index.html'));
    } else {
        mainWindow.loadFile(path.join(__dirname, 'src/html/wizard.html'));
    }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function readMetadata(promptsPath) {
    const metadataPath = path.join(promptsPath, '.metadata.json');
    try {
        if (fs.existsSync(metadataPath)) return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    } catch (error) { console.error('Errore lettura metadati:', error); }
    return {};
}

function writeMetadata(promptsPath, data) {
    const metadataPath = path.join(promptsPath, '.metadata.json');
    try {
        fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2));
    } catch (error) { console.error('Errore scrittura metadati:', error); }
}

// --- GESTIONE COMUNICAZIONE CON IL FRONTEND (IPC) ---

// *** MODIFICATO: Rimossa la creazione della notifica nativa ***
ipcMain.on('copy-to-clipboard', (event, text) => {
    clipboard.writeText(text);
    // La notifica ora è gestita interamente dal frontend (renderer.js).
});

ipcMain.on('open-folder-dialog', (event) => {
    dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
        .then(result => {
            if (!result.canceled) {
                store.set('promptsPath', result.filePaths[0]);
                mainWindow.loadFile(path.join(__dirname, 'src/html/index.html'));
            }
        }).catch(err => console.log(err));
});
ipcMain.handle('get-prompts-path', () => store.get('promptsPath'));
ipcMain.handle('read-prompt-items', (event, dirPath) => {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        return items.filter(item => !item.name.startsWith('.')).map(item => {
            const itemPath = path.join(dirPath, item.name);
            if (item.isDirectory()) return { name: item.name, type: 'directory', path: itemPath };
            if (item.isFile() && (item.name.endsWith('.txt') || item.name.endsWith('.md'))) return { name: item.name, type: 'file', path: itemPath };
            return null;
        }).filter(Boolean);
    } catch (error) { return []; }
});
ipcMain.handle('delete-item', async (event, itemPath, itemType) => {
    const itemDisplayType = itemType === 'directory' ? 'la cartella' : 'il file';
    const result = await dialog.showMessageBox(mainWindow, { type: 'warning', buttons: ['Annulla', 'Elimina'], defaultId: 0, cancelId: 0, title: `Conferma Eliminazione`, message: `Sei sicuro di voler eliminare ${itemDisplayType} "${path.basename(itemPath)}"?`, detail: 'Questa azione è irreversibile.' });
    if (result.response === 1) {
        try {
            if (itemType === 'directory') fs.rmSync(itemPath, { recursive: true, force: true }); else fs.unlinkSync(itemPath);
            const promptsPath = store.get('promptsPath'); const metadata = readMetadata(promptsPath);
            if (metadata[itemPath]) { delete metadata[itemPath]; writeMetadata(promptsPath, metadata); }
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    }
    return { success: false, reason: 'cancelled' };
});
ipcMain.handle('read-file-content', (event, filePath) => { try { return fs.readFileSync(filePath, 'utf-8'); } catch (error) { return null; } });
ipcMain.handle('write-file-content', (event, filePath, content) => { try { fs.writeFileSync(filePath, content, 'utf-8'); return { success: true }; } catch (error) { return { success: false, error: error.message }; } });
ipcMain.handle('create-item', (event, parentDir, itemType, itemName) => {
    let fullPath = path.join(parentDir, itemName); let counter = 1;
    while (fs.existsSync(fullPath)) { const ext = path.extname(itemName), base = path.basename(itemName, ext); fullPath = path.join(parentDir, `${base} (${counter})${ext}`); counter++; }
    try { if (itemType === 'directory') fs.mkdirSync(fullPath); else fs.writeFileSync(fullPath, ''); return { success: true, newPath: fullPath }; } catch (error) { return { success: false, error: error.message }; }
});
ipcMain.handle('rename-item', async (event, oldPath, newName) => {
    const parentDir = path.dirname(oldPath); const newPath = path.join(parentDir, newName);
    if (fs.existsSync(newPath)) return { success: false, error: 'exists' };
    try {
        fs.renameSync(oldPath, newPath);
        const promptsPath = store.get('promptsPath'); const metadata = readMetadata(promptsPath);
        if (metadata[oldPath]) { metadata[newPath] = metadata[oldPath]; delete metadata[oldPath]; writeMetadata(promptsPath, metadata); }
        return { success: true, newPath: newPath };
    } catch (error) { return { success: false, error: error.message }; }
});
ipcMain.handle('get-all-metadata', async () => { const promptsPath = store.get('promptsPath'); if (!promptsPath) return {}; return readMetadata(promptsPath); });
ipcMain.handle('set-item-color', async (event, itemPath, color) => {
    const promptsPath = store.get('promptsPath'); if (!promptsPath) return { success: false };
    const metadata = readMetadata(promptsPath); if (!metadata[itemPath]) metadata[itemPath] = {}; metadata[itemPath].color = color;
    writeMetadata(promptsPath, metadata);
    return { success: true };
});
ipcMain.handle('get-zoom-level', () => store.get('zoomLevel'));
ipcMain.handle('set-zoom-level', (event, level) => store.set('zoomLevel', level));
ipcMain.handle('move-item', async (event, itemPath, newParentPath) => {
    const itemName = path.basename(itemPath); const destinationPath = path.join(newParentPath, itemName);
    if (itemPath === newParentPath || fs.existsSync(destinationPath)) return { success: false, error: 'exists_or_same' };
    try {
        fs.renameSync(itemPath, destinationPath);
        const promptsPath = store.get('promptsPath'); const metadata = readMetadata(promptsPath);
        if (metadata[itemPath]) { metadata[destinationPath] = metadata[itemPath]; delete metadata[itemPath]; writeMetadata(promptsPath, metadata); }
        return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
});