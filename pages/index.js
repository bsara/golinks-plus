const EDIT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-edit"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
const RELOAD_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-refresh-cw"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';
const DELETE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-trash-2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

const SHARED_SETTINGS_KEYS = ["sharedGolinksURL", "sharedGolinksSkipHeader", "sharedGolinksCreateURLTemplate", "sharedGolinksCreateOnUnknown", "sharedGolinksNoCache"];

document.addEventListener('DOMContentLoaded', function () {
    const table = document.querySelector('.golink-table tbody');
    const siteFooter = document.querySelector('.site-footer');
    const golinkCountLabel = document.querySelector('.golink-home--count');
    const sharedForm = document.querySelector('form#shared-golinks');
    const sharedURLInput = sharedForm.querySelector('input[name="url"]');
    const sharedStatus = sharedForm.querySelector('.shared-golinks--status');
    const sharedView = sharedForm.querySelector('.shared-golinks--view');
    const sharedLink = sharedForm.querySelector('.shared-golinks--link');
    const sharedReloadLink = sharedForm.querySelector('.shared-golinks--reload');
    const sharedEditLink = sharedForm.querySelector('.shared-golinks--edit');
    const sharedDeleteLink = sharedForm.querySelector('.shared-golinks--delete');
    const sharedInputSection = sharedForm.querySelector('.shared-golinks--input');
    const sharedCancelLink = sharedForm.querySelector('.shared-golinks--cancel');
    const sharedSkipHeaderCheckbox = sharedForm.querySelector('input[name="skipHeader"]');
    const sharedNoCacheCheckbox = sharedForm.querySelector('input[name="noCache"]');
    const sharedConfigureCreateButton = sharedForm.querySelector('.shared-golinks--configure-create');
    const sharedCreateDialog = document.querySelector('.shared-create-dialog');
    const sharedCreateForm = sharedCreateDialog.querySelector('form#shared-create');
    const sharedCreateURLTemplateInput = sharedCreateForm.querySelector('input[name="urlTemplate"]');
    const sharedCreateOnUnknownCheckbox = sharedCreateForm.querySelector('input[name="createOnUnknown"]');
    const sharedCreateCancelLink = sharedCreateForm.querySelector('.shared-create-dialog--cancel');
    const sharedCreateDeleteButton = sharedCreateForm.querySelector('.shared-create-dialog--delete');
    const sharedManagedNote = sharedForm.querySelector('.shared-golinks--managed');
    const exportLink = document.querySelector('.golink-home--export');
    const exportSharedLinks = document.querySelector('.golink-home--export-shared');
    const sharedSettingsLinks = sharedForm.querySelector('.shared-golinks--settings');
    const sharedImportLink = sharedForm.querySelector('.shared-golinks--import');
    const sharedImportFileInput = sharedForm.querySelector('.shared-golinks--import-file');
    const sharedExportLink = sharedForm.querySelector('.shared-golinks--export');
    const sharedCountLabel = sharedForm.querySelector('.shared-golinks--count');
    const filterInput = document.querySelector('.golink-table--filter');
    let savedSharedURL = '';
    // Keys locked by enterprise policy; the background worker copies their values into local storage
    let managedKeys = new Set();

    function applyFilter() {
        const query = filterInput.value.trim().toLocaleLowerCase();
        table.querySelectorAll('.golink-row').forEach(row => {
            const name = row.cells[0].textContent.toLocaleLowerCase();
            const url = row.cells[1].textContent.toLocaleLowerCase();
            row.hidden = Boolean(query) && !name.includes(query) && !url.includes(query);
        });
    }

    filterInput.addEventListener('input', applyFilter);

    async function rerenderTable() {
        table.querySelectorAll('.golink-row').forEach(row => row.remove());

        const { golinks, sharedGolinks = {}, sharedGolinksURL, sharedGolinksSkipHeader = false, sharedGolinksNoCache = false } = await chrome.storage.local.get(["golinks", "sharedGolinks", "sharedGolinksURL", "sharedGolinksSkipHeader", "sharedGolinksNoCache"]);
        let sharedGolinksData = sharedGolinks || {};
        if (sharedGolinksNoCache && sharedGolinksURL) {
            try {
                const hasHostPermission = await chrome.permissions.contains(__helpers.toHostPermission(sharedGolinksURL));
                const response = await fetch(sharedGolinksURL, { credentials: hasHostPermission ? "include" : "same-origin" });
                if (response.ok) {
                    sharedGolinksData = __helpers.parseGolinksCSV(await response.text(), sharedGolinksSkipHeader);
                }
            } catch (e) {
                sharedGolinksData = sharedGolinks || {};
            }
        }
        const localEntries = Object.entries(golinks || {}).map(([key, value]) => [key, value, false]);
        const sharedEntries = Object.entries(sharedGolinksData).map(([key, value]) => [key, value, true]);

        // Alphabetical by name; a local golink comes before the shared golink it overrides
        const entries = [...localEntries, ...sharedEntries]
            .sort(([keyA, , isSharedA], [keyB, , isSharedB]) => keyA.localeCompare(keyB) || isSharedA - isSharedB);

        const totalGolinkCount = Object.keys({ ...sharedGolinksData, ...golinks }).length;
        golinkCountLabel.textContent = `${totalGolinkCount} link${totalGolinkCount === 1 ? '' : 's'}`;

        for (let [key, value, isShared] of entries) {
            const row = table.insertRow();
            row.className = 'golink-row';

            const nameCell = row.insertCell();
            nameCell.textContent = key;
            if (isShared && Object.hasOwn(golinks || {}, key)) {
                row.classList.add('golink-row--overridden');
                row.title = 'Overridden';
            }

            const urlCell = row.insertCell();
            urlCell.className = 'word-break-all';
            const href = document.createElement('a');
            href.href = value;
            href.className = 'text-black';
            href.textContent = value;
            urlCell.appendChild(href);

            const actionsCell = row.insertCell();
            actionsCell.className = 'nowrap';

            if (isShared) {
                const sharedLabel = document.createElement('span');
                sharedLabel.className = 'golink-row--shared';
                sharedLabel.textContent = 'shared';
                actionsCell.appendChild(sharedLabel);
                continue;
            }

            const editLink = document.createElement('a');
            editLink.innerHTML = EDIT_ICON;
            editLink.href = `/pages/edit.html?name=${encodeURIComponent(key)}`;
            editLink.className = 'golink-row--action';
            editLink.title = 'Edit golink';
            editLink.ariaLabel = 'Edit golink';
            actionsCell.appendChild(editLink);

            const deleteLink = document.createElement('a');
            deleteLink.className = 'golink-row--action';
            deleteLink.innerHTML = DELETE_ICON;
            deleteLink.setAttribute('href', '#');
            deleteLink.title = 'Delete golink';
            deleteLink.ariaLabel = 'Delete golink';
            deleteLink.addEventListener('click', async (event) => {
                event.target.disabled = true;
                if (confirm(`Delete golink '${key}'?`) == true) {
                    const { golinks } = await chrome.storage.local.get("golinks");
                    delete golinks[key];
                    await chrome.storage.local.set({ golinks });
                    rerenderTable();
                }
                event.target.disabled = false;
            });
            actionsCell.appendChild(deleteLink);
        }

        applyFilter();

        const currentGolinkCount = Object.keys(golinks || {}).length;
        if (currentGolinkCount === 0) {
            return;
        }

        const tableFooter = document.querySelector('.golink-table--footer');
        tableFooter.innerHTML = '';
        const deleteAllLink = document.createElement('a');
        deleteAllLink.addEventListener('click', async (event) => {
            event.target.disabled = true;
            const confirmation = `delete ${currentGolinkCount} link${currentGolinkCount > 1 ? 's' : ''}`;
            const answer = prompt(`Are you sure? Type '${confirmation}' to confirm.`);
            if (answer.toLocaleLowerCase() !== confirmation.toLocaleLowerCase()) {
                return;
            }
            await chrome.storage.local.set({ golinks: {} });
            rerenderTable();
            event.target.disabled = false;
        });
        deleteAllLink.setAttribute('href', '#');
        deleteAllLink.textContent = 'Delete all personal links';
        tableFooter.appendChild(deleteAllLink);
    }

    function renderSiteFooter() {
        const { version, homepage_url } = chrome.runtime.getManifest();
        const footerRepoLink = document.createElement('a');
        footerRepoLink.href = homepage_url;
        footerRepoLink.target = '_blank';
        footerRepoLink.textContent = `v${version}`;
        siteFooter.appendChild(footerRepoLink);

        const footerHelpText = document.createElement('span');
        footerHelpText.textContent = ' | ';
        siteFooter.appendChild(footerHelpText);

        const footerHelpLink = document.createElement('a');
        footerHelpLink.href = '/pages/help.html';
        footerHelpLink.textContent = 'Help';
        siteFooter.appendChild(footerHelpLink);
    }

    async function renderSharedStatus() {
        const { sharedGolinksURL, sharedGolinks, sharedGolinksError, sharedGolinksNoCache = false, sharedGolinksSkipHeader = false } = await chrome.storage.local.get(["sharedGolinksURL", "sharedGolinks", "sharedGolinksError", "sharedGolinksNoCache", "sharedGolinksSkipHeader"]);
        if (!sharedGolinksURL) {
            if (sharedStatus) {
                sharedStatus.textContent = '';
                sharedStatus.classList.remove('shared-golinks--status-error');
            }
            if (sharedCountLabel) sharedCountLabel.textContent = '';
            return;
        }
        if (sharedGolinksNoCache) {
            if (sharedStatus) {
                sharedStatus.classList.remove('shared-golinks--status-error');
                sharedStatus.textContent = '';
            }
            if (sharedCountLabel) sharedCountLabel.textContent = 'Loading shared golinks...';
            try {
                if (typeof chrome !== 'undefined' && chrome.permissions) {
                    const hasHostPermission = await chrome.permissions.contains(__helpers.toHostPermission(sharedGolinksURL));
                    const response = await fetch(sharedGolinksURL, { credentials: hasHostPermission ? "include" : "same-origin" });
                    if (response.ok) {
                        const sharedGolinksData = __helpers.parseGolinksCSV(await response.text(), sharedGolinksSkipHeader);
                        const sharedGolinkCount = Object.keys(sharedGolinksData).length;
                        if (sharedCountLabel) sharedCountLabel.textContent = `${sharedGolinkCount} shared link${sharedGolinkCount === 1 ? '' : 's'}`;
                        return;
                    } else {
                        throw new Error(`HTTP ${response.status}`);
                    }
                } else {
                    const response = await fetch(sharedGolinksURL);
                    if (response.ok) {
                        const sharedGolinksData = __helpers.parseGolinksCSV(await response.text(), sharedGolinksSkipHeader);
                        const sharedGolinkCount = Object.keys(sharedGolinksData).length;
                        if (sharedCountLabel) sharedCountLabel.textContent = `${sharedGolinkCount} shared link${sharedGolinkCount === 1 ? '' : 's'}`;
                        return;
                    } else {
                        throw new Error(`HTTP ${response.status}`);
                    }
                }
            } catch (e) {
                if (sharedStatus) {
                    sharedStatus.classList.add('shared-golinks--status-error');
                    sharedStatus.textContent = `Failed to load shared golinks: ${e.message}`;
                }
                if (sharedCountLabel) sharedCountLabel.textContent = '';
                return;
            }
        }
        if (sharedStatus) {
            sharedStatus.classList.toggle('shared-golinks--status-error', Boolean(sharedGolinksError));
        }
        if (sharedGolinksError) {
            if (sharedStatus) sharedStatus.textContent = `Failed to load shared golinks: ${sharedGolinksError}`;
            if (sharedCountLabel) sharedCountLabel.textContent = '';
        } else if (sharedGolinks === undefined) {
            if (sharedStatus) {
                sharedStatus.classList.remove('shared-golinks--status-error');
                sharedStatus.textContent = '';
            }
            if (sharedCountLabel) sharedCountLabel.textContent = 'Loading shared golinks...';
        } else {
            const sharedGolinkCount = Object.keys(sharedGolinks).length;
            if (sharedStatus) {
                sharedStatus.classList.remove('shared-golinks--status-error');
                sharedStatus.textContent = '';
            }
            if (sharedCountLabel) sharedCountLabel.textContent = `${sharedGolinkCount} shared link${sharedGolinkCount === 1 ? '' : 's'}`;
        }
    }

    // Must be called before any other await in a click or submit handler; Chrome only shows the
    // prompt during a user action. A denied request still lets the fetch try without the permission.
    function requestHostPermission(url) {
        return chrome.permissions.request(__helpers.toHostPermission(url)).catch(() => false);
    }

    function renderSharedForm(isEditing) {
        const showView = savedSharedURL && !isEditing;
        sharedView.hidden = !showView;
        sharedInputSection.hidden = showView;
        sharedCancelLink.hidden = !savedSharedURL;
        sharedView.classList.toggle('shared-golinks--view-managed', managedKeys.has('sharedGolinksURL'));
        sharedEditLink.hidden = managedKeys.has('sharedGolinksURL');
        sharedDeleteLink.hidden = managedKeys.has('sharedGolinksURL');
        sharedSkipHeaderCheckbox.disabled = managedKeys.has('sharedGolinksSkipHeader');
        if (sharedNoCacheCheckbox) {
            sharedNoCacheCheckbox.disabled = managedKeys.has('sharedGolinksNoCache');
        }
        sharedSettingsLinks.hidden = managedKeys.size > 0;
        sharedManagedNote.hidden = managedKeys.size === 0;
        sharedConfigureCreateButton.hidden = !savedSharedURL;
        exportLink.hidden = Boolean(savedSharedURL);
        exportSharedLinks.hidden = !savedSharedURL;
        sharedLink.href = savedSharedURL;
        sharedLink.textContent = savedSharedURL;
        sharedURLInput.value = savedSharedURL;
    }

    async function renderSharedConfigureCreateButton() {
        const { sharedGolinksCreateURLTemplate } = await chrome.storage.local.get("sharedGolinksCreateURLTemplate");
        sharedConfigureCreateButton.value = `${sharedGolinksCreateURLTemplate ? 'Configure' : 'Add'} Shared Link Creation`;
    }

    async function initSharedForm() {
        // The policy value for opening the creation URL on unknown links is only a default, so it stays editable
        const { sharedGolinksCreateOnUnknown, ...managed } = await chrome.storage.managed.get(null);
        managedKeys = new Set(Object.keys(managed));
        const { sharedGolinksURL = '', sharedGolinksSkipHeader = false, sharedGolinksNoCache = false } = await chrome.storage.local.get(["sharedGolinksURL", "sharedGolinksSkipHeader", "sharedGolinksNoCache"]);
        savedSharedURL = sharedGolinksURL;
        sharedSkipHeaderCheckbox.checked = sharedGolinksSkipHeader;
        if (sharedNoCacheCheckbox) {
            sharedNoCacheCheckbox.checked = sharedGolinksNoCache;
        }
        if (!sharedGolinksURL && sharedCountLabel) {
            sharedCountLabel.textContent = '';
        }
        sharedReloadLink.innerHTML = RELOAD_ICON;
        sharedEditLink.innerHTML = EDIT_ICON;
        sharedDeleteLink.innerHTML = DELETE_ICON;
        renderSharedForm(false);
        renderSharedStatus();
        renderSharedConfigureCreateButton();
    }

    sharedReloadLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await requestHostPermission(savedSharedURL);
        const { sharedGolinksNoCache = false } = await chrome.storage.local.get("sharedGolinksNoCache");
        if (sharedGolinksNoCache) {
            if (sharedCountLabel) sharedCountLabel.textContent = 'Loading shared golinks...';
            rerenderTable();
            await renderSharedStatus();
            return;
        }
        await chrome.runtime.sendMessage({ type: 'refreshSharedGolinks' });
        // Unchanged shared golinks don't fire storage.onChanged, so the status is refreshed here
        renderSharedStatus();
    });

    sharedSkipHeaderCheckbox.addEventListener('change', () => {
        chrome.storage.local.set({ sharedGolinksSkipHeader: sharedSkipHeaderCheckbox.checked });
    });

    if (sharedNoCacheCheckbox) {
        sharedNoCacheCheckbox.addEventListener('change', () => {
            chrome.storage.local.set({ sharedGolinksNoCache: sharedNoCacheCheckbox.checked });
        });
    }

    sharedEditLink.addEventListener('click', (e) => {
        e.preventDefault();
        renderSharedForm(true);
        sharedURLInput.focus();
    });

    sharedCancelLink.addEventListener('click', (e) => {
        e.preventDefault();
        renderSharedForm(false);
    });

    sharedDeleteLink.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm(`Delete shared CSV URL '${savedSharedURL}'?`)) {
            return;
        }
        await chrome.storage.local.remove("sharedGolinksURL");
        savedSharedURL = '';
        if (sharedCountLabel) sharedCountLabel.textContent = '';
        renderSharedForm(false);
    });

    sharedForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = sharedURLInput.value.trim();
        if (!value) {
            await chrome.storage.local.remove("sharedGolinksURL");
            savedSharedURL = '';
            if (sharedCountLabel) sharedCountLabel.textContent = '';
            renderSharedForm(false);
            return;
        }
        const url = __helpers.defaultToHTTPS(value);
        if (!__helpers.isValidURL(url)) {
            alert('Invalid URL. Protocol required (http:// or https://)');
            return;
        }
        await requestHostPermission(url);
        // Saving the same URL again leaves storage unchanged, so no refresh is triggered
        await chrome.storage.local.set({ sharedGolinksURL: url });
        savedSharedURL = url;
        renderSharedForm(false);
    });

    sharedConfigureCreateButton.addEventListener('click', async () => {
        const { sharedGolinksCreateURLTemplate = '', sharedGolinksCreateOnUnknown = false } = await chrome.storage.local.get(["sharedGolinksCreateURLTemplate", "sharedGolinksCreateOnUnknown"]);
        sharedCreateURLTemplateInput.value = sharedGolinksCreateURLTemplate;
        sharedCreateOnUnknownCheckbox.checked = sharedGolinksCreateOnUnknown;
        const isTemplateManaged = managedKeys.has('sharedGolinksCreateURLTemplate');
        sharedCreateURLTemplateInput.disabled = isTemplateManaged;
        sharedCreateDeleteButton.hidden = !sharedGolinksCreateURLTemplate || isTemplateManaged;
        sharedCreateDialog.showModal();
    });

    sharedCreateCancelLink.addEventListener('click', (e) => {
        e.preventDefault();
        sharedCreateDialog.close();
    });

    sharedCreateDeleteButton.addEventListener('click', async () => {
        if (!confirm('Delete shared link creation URL?')) {
            return;
        }
        await chrome.storage.local.remove(["sharedGolinksCreateURLTemplate", "sharedGolinksCreateOnUnknown"]);
        sharedCreateDialog.close();
    });

    sharedCreateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const urlTemplate = __helpers.defaultToHTTPS(sharedCreateURLTemplateInput.value.trim());
        if (!__helpers.isValidURL(__helpers.fillURLTemplate(urlTemplate, 'name', 'https://example.com'))) {
            alert('Invalid URL. Protocol required (http:// or https://)');
            return;
        }
        await chrome.storage.local.set({
            sharedGolinksCreateURLTemplate: urlTemplate,
            sharedGolinksCreateOnUnknown: sharedCreateOnUnknownCheckbox.checked,
        });
        sharedCreateDialog.close();
    });

    sharedExportLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const settings = await chrome.storage.local.get(SHARED_SETTINGS_KEYS);
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }));
        downloadLink.download = 'golinks-shared-settings.json';
        downloadLink.click();
    });

    sharedImportLink.addEventListener('click', (e) => {
        e.preventDefault();
        sharedImportFileInput.click();
    });

    // Replaces all shared settings; keys missing from the file are removed
    sharedImportFileInput.addEventListener('change', async () => {
        const [file] = sharedImportFileInput.files;
        sharedImportFileInput.value = '';
        if (!file) {
            return;
        }
        let settings;
        try {
            settings = JSON.parse(await file.text());
        } catch (error) {
            alert(`Invalid settings file: ${error.message}`);
            return;
        }
        const { sharedGolinksURL, sharedGolinksSkipHeader, sharedGolinksCreateURLTemplate, sharedGolinksCreateOnUnknown, sharedGolinksNoCache } = settings ?? {};
        if (typeof sharedGolinksURL !== 'string' || !__helpers.isValidURL(sharedGolinksURL)) {
            alert('Invalid settings file: sharedGolinksURL must be a valid URL');
            return;
        }
        if (sharedGolinksCreateURLTemplate !== undefined
            && (typeof sharedGolinksCreateURLTemplate !== 'string' || !__helpers.isValidURL(__helpers.fillURLTemplate(sharedGolinksCreateURLTemplate, 'name', 'https://example.com')))) {
            alert('Invalid settings file: sharedGolinksCreateURLTemplate must be a valid URL template');
            return;
        }
        if (!confirm(`Replace shared settings with '${sharedGolinksURL}'?`)) {
            return;
        }
        await chrome.storage.local.remove(SHARED_SETTINGS_KEYS);
        await chrome.storage.local.set({
            sharedGolinksURL,
            sharedGolinksSkipHeader: Boolean(sharedGolinksSkipHeader),
            sharedGolinksNoCache: Boolean(sharedGolinksNoCache),
            ...(sharedGolinksCreateURLTemplate && {
                sharedGolinksCreateURLTemplate,
                sharedGolinksCreateOnUnknown: Boolean(sharedGolinksCreateOnUnknown),
            }),
        });
        initSharedForm();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'managed') {
            initSharedForm();
            return;
        }
        if (areaName !== 'local') {
            return;
        }
        // Catches values the background worker copies in from policy
        if (SHARED_SETTINGS_KEYS.some(key => changes[key])) {
            initSharedForm();
        }
        if (changes.sharedGolinks || changes.sharedGolinksNoCache || changes.sharedGolinksSkipHeader) {
            rerenderTable();
        }
        if (changes.sharedGolinksURL || changes.sharedGolinks || changes.sharedGolinksError || changes.sharedGolinksNoCache || changes.sharedGolinksSkipHeader) {
            renderSharedStatus();
        }
        if (changes.sharedGolinksCreateURLTemplate) {
            renderSharedConfigureCreateButton();
        }
    });

    rerenderTable();
    renderSiteFooter();
    initSharedForm();
});