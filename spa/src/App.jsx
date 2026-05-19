import { useEffect, useMemo, useState } from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Toast from '@radix-ui/react-toast';
import { MoonIcon, ReloadIcon, SunIcon, TrashIcon, UploadIcon } from '@radix-ui/react-icons';
import './App.css';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const THEME_STORAGE_KEY = 'ui-theme-preference';

function resolveInitialTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'light';
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function StatusBadge({ value }) {
  return <span className={`status status-${value.toLowerCase()}`}>{value}</span>;
}

function getProcessedMediaUrl(fileId) {
  return `${apiBase}/files/${fileId}/media`;
}

export default function App() {
  const [theme, setTheme] = useState(() => resolveInitialTheme());
  const [toastOpen, setToastOpen] = useState(false);
  const [toastTitle, setToastTitle] = useState('');
  const [toastDescription, setToastDescription] = useState('');
  const [toastVariant, setToastVariant] = useState('success');
  const [files, setFiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [pathInput, setPathInput] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function showToast({ title, description, variant = 'success' }) {
    setToastTitle(title);
    setToastDescription(description);
    setToastVariant(variant);
    setToastOpen(false);
    window.requestAnimationFrame(() => {
      setToastOpen(true);
    });
  }

  const selected = useMemo(() => files.find((item) => item.id === selectedId), [files, selectedId]);

  async function selectFile(id) {
    setSelectedId(id);
    if (!id) {
      setDetails(null);
      return;
    }

    try {
      const payload = await request(`/files/${id}`);
      setDetails(payload);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadFiles(selectId) {
    setLoading(true);
    try {
      const payload = await request('/files');
      setFiles(payload);
      if (selectId) {
        await selectFile(selectId);
      } else if (payload.length && !selectedId) {
        await selectFile(payload[0].id);
      } else if (!payload.length) {
        await selectFile(null);
      }
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let ignored = false;

    void (async () => {
      setLoading(true);
      try {
        const payload = await request('/files');
        if (ignored) {
          return;
        }
        setFiles(payload);

        if (payload.length) {
          const firstId = payload[0].id;
          setSelectedId(firstId);
          const detailsPayload = await request(`/files/${firstId}`);
          if (!ignored) {
            setDetails(detailsPayload);
          }
        }
      } catch (err) {
        if (!ignored) {
          setError(err.message);
        }
      } finally {
        if (!ignored) {
          setLoading(false);
        }
      }
    })();

    return () => {
      ignored = true;
    };
  }, []);

  async function submitPath(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const payload = await request('/files/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: pathInput.trim() }),
      });
      setPathInput('');
      await loadFiles(payload.id);
      showToast({
        title: 'Path queued',
        description: `File #${payload.id} is being processed.`,
      });
    } catch (err) {
      setError(err.message);
      showToast({
        title: 'Unable to process path',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  async function submitUpload(event) {
    event.preventDefault();
    if (!uploadFile) {
      setError('Choose an MP4 file first.');
      showToast({
        title: 'No file selected',
        description: 'Choose an MP4 file before uploading.',
        variant: 'error',
      });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const response = await fetch(`${apiBase}/files/upload`, { method: 'POST', body: formData });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Upload failed');
      }
      const payload = await response.json();
      setUploadFile(null);
      await loadFiles(payload.id);
      setError('');
      showToast({
        title: 'Upload accepted',
        description: `File #${payload.id} is being processed.`,
      });
    } catch (err) {
      setError(err.message);
      showToast({
        title: 'Upload failed',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  async function removeSelected() {
    if (!selected) {
      return;
    }
    setLoading(true);

    try {
      await request(`/files/${selected.id}`, { method: 'DELETE' });
      const deletedId = selected.id;
      setSelectedId(null);
      setDetails(null);
      await loadFiles();
      showToast({
        title: 'File deleted',
        description: `Removed file #${deletedId}.`,
      });
    } catch (err) {
      setError(err.message);
      showToast({
        title: 'Delete failed',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Toast.Provider swipeDirection="right">
      <main className="app">
        <header className="hero panel">
        <div>
          <p className="eyebrow">Unicast Pipeline</p>
          <h1>MP4 Initialization Processor</h1>
          <p className="subtitle">Upload a video or queue an absolute path for backend processing.</p>
        </div>

        <button
          type="button"
          className="theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          onClick={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
        >
          <span className="theme-icon-wrap" aria-hidden="true">
            <SunIcon className="theme-icon theme-icon-sun" />
            <MoonIcon className="theme-icon theme-icon-moon" />
          </span>
          <span className="theme-text">{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
        </header>

        <section className="panel action-panel">
        <form onSubmit={submitUpload} className="form-row" aria-label="Upload form">
          <label htmlFor="upload-file">Upload MP4:</label>
          <div className="input-group">
            <input
              id="upload-file"
              name="file"
              type="file"
              accept=".mp4"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />
            <button disabled={loading} type="submit">
              <UploadIcon aria-hidden="true" />
              Upload & Process
            </button>
          </div>
        </form>

        <form onSubmit={submitPath} className="form-row" aria-label="Path form">
          <label htmlFor="path-input">Absolute path:</label>
          <div className="input-group">
            <input
              id="path-input"
              type="text"
              value={pathInput}
              placeholder="/home/runner/work/.../video.mp4"
              onChange={(event) => setPathInput(event.target.value)}
            />
            <button disabled={loading} type="submit">Process Path</button>
          </div>
        </form>

        <div className="controls">
          <button disabled={loading} onClick={() => loadFiles()} type="button">
            <ReloadIcon aria-hidden="true" />
            Refresh
          </button>
          <button disabled={loading || !selected} onClick={removeSelected} type="button">
            <TrashIcon aria-hidden="true" />
            Delete Selected
          </button>
        </div>

        {error ? <p role="alert" className="error">{error}</p> : null}
        </section>

        <section className="content-grid">
        <article className="panel">
          <h2>Files</h2>
          <ScrollArea.Root className="files-scroll-root" type="auto">
            <ScrollArea.Viewport className="files-scroll-viewport">
              <ul className="list">
                {files.map((item) => (
                  <li key={item.id}>
                    <button
                      className={`list-item ${selectedId === item.id ? 'active' : ''}`}
                      onClick={() => selectFile(item.id)}
                      type="button"
                    >
                      <span>#{item.id} {item.filePath}</span>
                      <StatusBadge value={item.status} />
                    </button>
                  </li>
                ))}
                {!files.length ? <li className="empty-list">No files queued yet.</li> : null}
              </ul>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
              <ScrollArea.Thumb className="scrollbar-thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </article>

        <article className="panel">
          <h2>Details</h2>
          {details ? (
            <>
              <dl>
                <dt>ID</dt><dd>{details.id}</dd>
                <dt>File path</dt><dd>{details.filePath}</dd>
                <dt>Status</dt><dd><StatusBadge value={details.status} /></dd>
                <dt>Processed path</dt><dd>{details.processedPath || '-'}</dd>
                <dt>Error</dt><dd>{details.errorMessage || '-'}</dd>
              </dl>

              {details.status === 'Successful' && details.processedPath ? (
                <div className="media-preview">
                  <h3>Processed media preview</h3>
                  <video
                    key={`${details.id}-${details.updatedAt || ''}`}
                    className="media-player"
                    controls
                    preload="metadata"
                    src={getProcessedMediaUrl(details.id)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <p>Select a file to view details.</p>
          )}
        </article>
        </section>
      </main>

      <Toast.Root
        className={`toast toast-${toastVariant}`}
        open={toastOpen}
        onOpenChange={setToastOpen}
        duration={3800}
      >
        <Toast.Title className="toast-title">{toastTitle}</Toast.Title>
        <Toast.Description className="toast-description">{toastDescription}</Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="toast-viewport" />
    </Toast.Provider>
  );
}
