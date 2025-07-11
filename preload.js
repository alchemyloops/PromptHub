// preload.js (Versione COMPLETA e AGGIORNATA)

const { contextBridge, ipcRenderer } = require('electron');

// Esponiamo in modo sicuro le funzioni che il frontend può chiamare
contextBridge.exposeInMainWorld('electronAPI', {
    // Funzioni esistenti
    openFolderDialog: () => ipcRenderer.send('open-folder-dialog'),
    getPromptsPath: () => ipcRenderer.invoke('get-prompts-path'),
    readPromptItems: (dirPath) => ipcRenderer.invoke('read-prompt-items', dirPath),
    deleteItem: (itemPath, itemType) => ipcRenderer.invoke('delete-item', itemPath, itemType),
    readFileContent: (filePath) => ipcRenderer.invoke('read-file-content', filePath),
    writeFileContent: (filePath, content) => ipcRenderer.invoke('write-file-content', filePath, content),
    createItem: (parentDir, itemType, itemName) => ipcRenderer.invoke('create-item', parentDir, itemType, itemName),
    renameItem: (oldPath, newName) => ipcRenderer.invoke('rename-item', oldPath, newName),
    getAllMetadata: () => ipcRenderer.invoke('get-all-metadata'),
    setItemColor: (itemPath, color) => ipcRenderer.invoke('set-item-color', itemPath, color),
    getZoomLevel: () => ipcRenderer.invoke('get-zoom-level'),
    setZoomLevel: (level) => ipcRenderer.invoke('set-zoom-level', level),
    moveItem: (itemPath, newParentPath) => ipcRenderer.invoke('move-item', itemPath, newParentPath),

    // *** MODIFICATO: La funzione `copyToClipboard` ora invia correttamente i dati al `main.js` ***
    copyToClipboard: (text) => ipcRenderer.send('copy-to-clipboard', text),
});