// src/js/wizard.js

document.getElementById('select-folder-btn').addEventListener('click', () => {
    // Chiama la funzione esposta nel preload.js
    window.electronAPI.openFolderDialog();
});