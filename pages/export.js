document.addEventListener('DOMContentLoaded', async function () {
    let content = '';
    const includeShared = new URLSearchParams(window.location.search).get('include') === 'all';
    const { golinks = {}, sharedGolinks = {}, sharedGolinksURL, sharedGolinksSkipHeader = false, sharedGolinksNoCache = false } = await chrome.storage.local.get(["golinks", "sharedGolinks", "sharedGolinksURL", "sharedGolinksSkipHeader", "sharedGolinksNoCache"]);
    let sharedGolinksData = sharedGolinks || {};
    if (includeShared && sharedGolinksNoCache && sharedGolinksURL) {
        try {
            if (typeof chrome !== 'undefined' && chrome.permissions) {
                const hasHostPermission = await chrome.permissions.contains(__helpers.toHostPermission(sharedGolinksURL));
                const response = await fetch(sharedGolinksURL, { credentials: hasHostPermission ? "include" : "same-origin" });
                if (response.ok) {
                    sharedGolinksData = __helpers.parseGolinksCSV(await response.text(), sharedGolinksSkipHeader);
                }
            } else {
                const response = await fetch(sharedGolinksURL);
                if (response.ok) {
                    sharedGolinksData = __helpers.parseGolinksCSV(await response.text(), sharedGolinksSkipHeader);
                }
            }
        } catch (e) {
            sharedGolinksData = sharedGolinks || {};
        }
    }
    // Local golinks win over shared golinks with the same name
    const exportedGolinks = includeShared ? { ...sharedGolinksData, ...golinks } : golinks;
    for (const [key, value] of Object.entries(exportedGolinks)) {
        content += `${key},${value}\n`;
    }
    document.querySelector('pre').textContent = content;

    const downloadLink = document.createElement('a');
    downloadLink.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
    downloadLink.download = 'golinks.csv';
    downloadLink.click();
});