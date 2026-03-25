(function () {
  const STORAGE_KEY = 'budget-app-api-key';
  const form = document.getElementById('import-form');
  const apiKeyInput = document.getElementById('api-key');
  const fileInput = document.getElementById('csv-file');
  const statusEl = document.getElementById('status');
  const submitBtn = document.getElementById('submit-btn');

  if (!form || !apiKeyInput || !fileInput || !statusEl || !submitBtn) {
    return;
  }

  apiKeyInput.value = localStorage.getItem(STORAGE_KEY) || '';

  function setStatus(className, text) {
    statusEl.className = 'status ' + (className || '');
    statusEl.textContent = text;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const key = apiKeyInput.value.trim();
    localStorage.setItem(STORAGE_KEY, key);

    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      setStatus('err', 'Choose a CSV file.');
      return;
    }

    const body = new FormData();
    body.append('file', file, file.name);

    const headers = {};
    if (key) {
      headers['X-API-Key'] = key;
    }

    submitBtn.disabled = true;
    setStatus('', 'Uploading…');

    try {
      const res = await fetch('/import/csv', {
        method: 'POST',
        headers,
        body,
      });
      const data = await res.json().catch(function () {
        return {};
      });

      if (res.status === 400) {
        setStatus('err', data.error || 'Bad request');
        return;
      }

      if (res.status === 401) {
        setStatus('err', 'Unauthorized — check your API key.');
        return;
      }

      if (res.status === 422) {
        const errs = formatErrors(data.errors);
        setStatus(
          'warn',
          'No rows were imported.\n' + (errs || JSON.stringify(data, null, 2)),
        );
        return;
      }

      if (!res.ok) {
        setStatus('err', data.error || 'Request failed (' + res.status + ')');
        return;
      }

      const imported = data.imported ?? 0;
      const errs = formatErrors(data.errors);
      const msg =
        'Imported ' +
        imported +
        ' transaction(s).' +
        (errs ? '\n\nRow notes:\n' + errs : '');
      setStatus(errs ? 'warn' : 'ok', msg);
    } catch (err) {
      setStatus('err', err instanceof Error ? err.message : String(err));
    } finally {
      submitBtn.disabled = false;
    }
  });

  function formatErrors(errors) {
    if (!errors || !errors.length) {
      return '';
    }
    return errors
      .map(function (e) {
        return 'Line ' + e.line + ': ' + e.message;
      })
      .join('\n');
  }
})();
