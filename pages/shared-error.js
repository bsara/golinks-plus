document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(window.location.search);
    const text = params.get('text') || params.get('name') || '';
    const name = params.get('name') || text;
    const error = params.get('error') || '';
    const nameLabel = document.querySelector('.shared-error--name');
    const errorLabel = document.querySelector('.shared-error--detail');
    const retryLink = document.querySelector('.shared-error--retry');
    const status = document.querySelector('.shared-error--status');
    let retrying = false;

    if (nameLabel) {
        nameLabel.textContent = name;
    }

    if (errorLabel) {
        if (error) {
            errorLabel.textContent = `Error: ${error}`;
            errorLabel.hidden = false;
        } else {
            errorLabel.hidden = true;
        }
    }

    retryLink.addEventListener('click', (e) => {
        e.preventDefault();
        retry();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.location.href = '/pages/index.html';
            return;
        }
        if (e.shiftKey && e.key === 'Enter' && !e.repeat) {
            e.preventDefault();
            retry();
        }
    });

    async function retry() {
        if (retrying || !text) {
            return;
        }
        retrying = true;
        status.textContent = 'Trying again...';
        try {
            const response = await chrome.runtime.sendMessage({ type: 'retryGolink', text });
            if (response?.error) {
                throw new Error(response.error);
            }
        } catch (error) {
            retrying = false;
            status.textContent = `Could not try again: ${error.message}`;
        }
    }
});
