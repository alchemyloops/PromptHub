// src/js/renderer.js (Versione COMPLETA e AGGIORNATA)

// --- RIFERIMENTI AL DOM ---
const desktop = document.getElementById('desktop');
const backBtn = document.getElementById('back-btn');
const breadcrumbsContainer = document.getElementById('breadcrumbs');
const newFolderBtn = document.getElementById('new-folder-btn');
const newPromptBtn = document.getElementById('new-prompt-btn');
const actionMenuContainer = document.getElementById('action-menu-container');
const colorPickerModal = document.getElementById('color-picker-modal');
const colorGrid = document.getElementById('color-grid');
const editorModal = document.getElementById('editor-modal');
const editorFilenameInput = document.getElementById('editor-filename');
const editorTextarea = document.getElementById('editor-textarea');
const editorCopyBtn = document.getElementById('editor-copy-btn');
const editorCloseBtn = document.getElementById('editor-close-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');
const creditsBtn = document.getElementById('credits-btn'); // *** NUOVO ***
const creditsModal = document.getElementById('credits-modal'); // *** NUOVO ***

// --- STATO DELL'APPLICAZIONE ---
let rootPath = '';
let currentPath = '';
let selectedIcon = null;
let editorSaveTimeout = null;
let currentOpenFile = null;
let metadataStore = {};
let sortableInstance = null;
const zoomLevels = ['small', 'medium', 'large'];
let currentZoomIndex = 1;

// --- FUNZIONI DI VISUALIZZAZIONE E UI ---

function createItemIcon(item) {
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'prompt-icon';
    iconWrapper.dataset.type = item.type;
    iconWrapper.dataset.path = item.path;
    const iconVisual = document.createElement('div');
    iconVisual.className = 'icon-visual';
    const iconShape = document.createElement('div');
    iconShape.className = item.type === 'directory' ? 'folder-icon-shape' : 'file-icon-shape';
    iconVisual.appendChild(iconShape);
    const iconLabel = document.createElement('span');
    iconLabel.className = 'icon-label';
    iconLabel.textContent = item.type === 'file' ? item.name.split('.').slice(0, -1).join('.') : item.name;
    iconWrapper.appendChild(iconVisual);
    iconWrapper.appendChild(iconLabel);
    const itemMeta = metadataStore[item.path];
    if (itemMeta && itemMeta.color) iconShape.style.setProperty('--item-color-override', itemMeta.color);
    iconWrapper.addEventListener('click', e => { e.stopPropagation(); handleIconSelection(iconWrapper); });
    if (item.type === 'directory') iconVisual.addEventListener('dblclick', () => loadItems(item.path));
    iconLabel.addEventListener('dblclick', e => { e.stopPropagation(); makeLabelEditable(iconLabel, item); });
    desktop.appendChild(iconWrapper);
}

function updateNavigationBar() {
    backBtn.disabled = (currentPath === rootPath);
    breadcrumbsContainer.innerHTML = '';
    const relativePath = currentPath.replace(rootPath, 'Home').split(/[\\/]/);
    relativePath.forEach((part, index) => {
        breadcrumbsContainer.innerHTML += `<span class="breadcrumb-part">${part}</span>`;
        if (index < relativePath.length - 1) breadcrumbsContainer.innerHTML += `<span class="breadcrumb-separator">></span>`;
    });
}

// --- LOGICA DI CREAZIONE, RINOMINA, ELIMINAZIONE ---

async function createNewItem(type) {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    let itemName = type === 'directory' ? 'Nuova Cartella' : `prompt-${timestamp}.txt`;
    const result = await window.electronAPI.createItem(currentPath, type, itemName);
    if (result.success) await loadItems(currentPath);
}

function makeLabelEditable(labelElement, item) {
    closeActionMenu();
    labelElement.contentEditable = true;
    labelElement.focus();
    const originalName = labelElement.textContent;
    const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(labelElement); selection.removeAllRanges(); selection.addRange(range);
    const finishEditing = async () => {
        labelElement.contentEditable = false;
        const newNameRaw = labelElement.textContent.trim();
        if (newNameRaw === '' || newNameRaw === originalName) { labelElement.textContent = originalName; return; }
        const extension = item.type === 'file' ? `.${item.path.split('.').pop()}` : '';
        const newName = newNameRaw + extension;
        await window.electronAPI.renameItem(item.path, newName);
        await loadItems(currentPath, true);
    };
    labelElement.addEventListener('blur', finishEditing, { once: true });
    labelElement.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); finishEditing(); } 
        else if (e.key === 'Escape') { labelElement.textContent = originalName; labelElement.blur(); }
    });
}

// --- GESTIONE MENU CONTESTUALE ---

function handleIconSelection(iconElement) {
    if (selectedIcon === iconElement) return;
    if (selectedIcon) closeActionMenu();
    selectedIcon = iconElement;
    selectedIcon.classList.add('selected');
    showActionMenu(iconElement);
}

function showActionMenu(iconElement) {
    const rect = iconElement.getBoundingClientRect();
    const itemType = iconElement.dataset.type;
    const actions = [{ name: 'color', icon: '🎨', angle: -20 }, { name: 'delete', icon: '🗑️', angle: 160 }];
    if (itemType === 'file') actions.unshift({ name: 'edit', icon: '✎', angle: -90 });
    actionMenuContainer.innerHTML = '';
    actions.forEach(action => {
        const button = document.createElement('div');
        button.className = `action-button action-${action.name}`;
        button.textContent = action.icon;
        button.title = action.name;
        const radius = 60;
        const x = Math.cos(action.angle * Math.PI / 180) * radius;
        const y = Math.sin(action.angle * Math.PI / 180) * radius;
        button.style.transform = `translate(${x}px, ${y}px)`;
        button.addEventListener('click', e => { e.stopPropagation(); handleActionClick(action.name); });
        actionMenuContainer.appendChild(button);
    });
    actionMenuContainer.style.top = `${rect.top + rect.height / 2}px`;
    actionMenuContainer.style.left = `${rect.left + rect.width / 2}px`;
    actionMenuContainer.classList.add('visible');
}

function closeActionMenu() {
    if (selectedIcon) selectedIcon.classList.remove('selected');
    selectedIcon = null;
    actionMenuContainer.classList.remove('visible');
    actionMenuContainer.innerHTML = '';
}

async function handleActionClick(actionName) {
    if (!selectedIcon) return;
    const itemPath = selectedIcon.dataset.path; const itemType = selectedIcon.dataset.type;
    switch (actionName) {
        case 'delete':
            const result = await window.electronAPI.deleteItem(itemPath, itemType);
            if (result.success) await loadItems(currentPath, true);
            closeActionMenu();
            break;
        case 'color': showColorPicker(); break;
        case 'edit': openEditor(itemPath); break;
    }
}

// --- GESTIONE MODALI (COLORI, EDITOR, CREDITS) ---

function showColorPicker() {
    const colors = ['#FF6B6B', '#FFD166', '#06D6A0', '#118AB2', '#073B4C', '#FFFFFF', '#F06595', '#A0C4FF', '#BDB2FF', '#FFC6FF', '#9BF6FF', '#495057'];
    colorGrid.innerHTML = '';
    colors.forEach(color => {
        const colorDot = document.createElement('div');
        colorDot.className = 'color-dot';
        colorDot.style.backgroundColor = color;
        colorDot.addEventListener('click', async () => {
            const itemPath = selectedIcon.dataset.path;
            await window.electronAPI.setItemColor(itemPath, color);
            metadataStore = await window.electronAPI.getAllMetadata();
            await loadItems(currentPath, false);
            closeColorPicker();
        });
        colorGrid.appendChild(colorDot);
    });
    colorPickerModal.classList.add('visible');
}

function closeColorPicker() { colorPickerModal.classList.remove('visible'); }

async function openEditor(filePath) {
    closeActionMenu();
    const content = await window.electronAPI.readFileContent(filePath); if (content === null) return;
    currentOpenFile = filePath;
    editorFilenameInput.value = filePath.split(/[\\/]/).pop();
    editorTextarea.value = content;
    editorModal.classList.add('visible'); editorTextarea.focus();
}

function closeEditor() {
    if (editorSaveTimeout) { clearTimeout(editorSaveTimeout); window.electronAPI.writeFileContent(currentOpenFile, editorTextarea.value); }
    editorModal.classList.remove('visible'); currentOpenFile = null;
}

// *** NUOVO: Funzioni per il modale dei credits ***
function showCredits() { creditsModal.classList.add('visible'); }
function closeCredits() { creditsModal.classList.remove('visible'); }

// --- LOGICA DRAG & DROP E ZOOM ---

function initializeDragAndDrop() {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(desktop, {
        animation: 150,
        group: 'shared',
        ghostClass: 'sortable-ghost',
        onEnd: async function (evt) {
            const itemEl = evt.item; const toEl = evt.to;
            if (toEl.classList.contains('prompt-icon') && toEl.dataset.type === 'directory') {
                const itemPath = itemEl.dataset.path;
                const newParentPath = toEl.dataset.path;
                const result = await window.electronAPI.moveItem(itemPath, newParentPath);
                if (result.success) await loadItems(currentPath, true);
                else await loadItems(currentPath);
            }
        },
    });
}

function applyZoom(levelIndex) {
    const level = zoomLevels[levelIndex];
    document.body.classList.remove(...zoomLevels);
    document.body.classList.add(level);
    window.electronAPI.setZoomLevel(level);
    currentZoomIndex = levelIndex;
    zoomOutBtn.disabled = (currentZoomIndex === 0);
    zoomInBtn.disabled = (currentZoomIndex === zoomLevels.length - 1);
}

// --- FUNZIONI DI CARICAMENTO E INIZIALIZZAZIONE ---

async function loadItems(path, forceMetadataRefresh = false) {
    try {
        currentPath = path;
        if (forceMetadataRefresh) metadataStore = await window.electronAPI.getAllMetadata();
        const items = await window.electronAPI.readPromptItems(path);
        closeActionMenu(); desktop.innerHTML = '';
        items.sort((a, b) => (a.type === 'directory' ? -1 : 1) - (b.type === 'directory' ? -1 : 1) || a.name.localeCompare(b.name));
        items.forEach(createItemIcon);
        updateNavigationBar();
        initializeDragAndDrop();
    } catch (error) { console.error(`Errore caricamento da ${path}:`, error); }
}

async function initialize() {
    const savedZoom = await window.electronAPI.getZoomLevel();
    currentZoomIndex = zoomLevels.indexOf(savedZoom);
    if (currentZoomIndex === -1) currentZoomIndex = 1;
    applyZoom(currentZoomIndex);
    rootPath = await window.electronAPI.getPromptsPath();
    if (rootPath) await loadItems(rootPath, true);
}

// --- EVENT LISTENERS GLOBALI ---

backBtn.addEventListener('click', () => {
    const parentPath = currentPath.split(/[\\/]/).slice(0, -1).join('/');
    if (parentPath.length >= rootPath.length) loadItems(parentPath);
});
desktop.addEventListener('click', closeActionMenu);
newFolderBtn.addEventListener('click', () => createNewItem('directory'));
newPromptBtn.addEventListener('click', () => createNewItem('file'));
colorPickerModal.addEventListener('click', e => { if (e.target === colorPickerModal) closeColorPicker(); });
colorPickerModal.querySelector('.close-modal-btn').addEventListener('click', closeColorPicker);
editorCloseBtn.addEventListener('click', closeEditor);
editorCopyBtn.addEventListener('click', () => window.electronAPI.copyToClipboard(editorTextarea.value));
editorTextarea.addEventListener('input', () => {
    if (editorSaveTimeout) clearTimeout(editorSaveTimeout);
    editorSaveTimeout = setTimeout(() => { window.electronAPI.writeFileContent(currentOpenFile, editorTextarea.value); editorSaveTimeout = null; }, 500);
});
editorFilenameInput.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
        const oldPath = currentOpenFile; const newName = e.target.value;
        const result = await window.electronAPI.renameItem(oldPath, newName);
        if (result.success) { currentOpenFile = result.newPath; await loadItems(currentPath, true); }
        e.target.blur();
    }
});
zoomInBtn.addEventListener('click', () => { if (currentZoomIndex < zoomLevels.length - 1) applyZoom(currentZoomIndex + 1); });
zoomOutBtn.addEventListener('click', () => { if (currentZoomIndex > 0) applyZoom(currentZoomIndex - 1); });
zoomResetBtn.addEventListener('click', () => applyZoom(1));
creditsBtn.addEventListener('click', showCredits); // *** NUOVO ***
creditsModal.addEventListener('click', e => { if (e.target === creditsModal) closeCredits(); }); // *** NUOVO ***
creditsModal.querySelector('.close-modal-btn').addEventListener('click', closeCredits); // *** NUOVO ***

document.addEventListener('DOMContentLoaded', initialize);