import { useEffect, useMemo, useState } from 'react';
import './App.css';

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

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

export default function App() {
  const [files, setFiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [pathInput, setPathInput] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitUpload(event) {
    event.preventDefault();
    if (!uploadFile) {
      setError('Choose an MP4 file first.');
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
    } catch (err) {
      setError(err.message);
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
      setSelectedId(null);
      setDetails(null);
      await loadFiles();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <h1>MP4 Initialization Processor</h1>
      <p className="subtitle">Upload a video or queue an absolute path for backend processing.</p>

      <section className="panel">
        <form onSubmit={submitUpload} className="form-row" aria-label="Upload form">
          <label htmlFor="upload-file">Upload MP4:</label>
          <input
            id="upload-file"
            name="file"
            type="file"
            accept=".mp4"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
          />
          <button disabled={loading} type="submit">Upload & Process</button>
        </form>

        <form onSubmit={submitPath} className="form-row" aria-label="Path form">
          <label htmlFor="path-input">Absolute path:</label>
          <input
            id="path-input"
            type="text"
            value={pathInput}
            placeholder="/home/runner/work/.../video.mp4"
            onChange={(event) => setPathInput(event.target.value)}
          />
          <button disabled={loading} type="submit">Process Path</button>
        </form>

        <div className="controls">
          <button disabled={loading} onClick={() => loadFiles()} type="button">Refresh</button>
          <button disabled={loading || !selected} onClick={removeSelected} type="button">Delete Selected</button>
        </div>

        {error ? <p role="alert" className="error">{error}</p> : null}
      </section>

      <section className="content-grid">
        <article className="panel">
          <h2>Files</h2>
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
            {!files.length ? <li>No files queued yet.</li> : null}
          </ul>
        </article>

        <article className="panel">
          <h2>Details</h2>
          {details ? (
            <dl>
              <dt>ID</dt><dd>{details.id}</dd>
              <dt>File path</dt><dd>{details.filePath}</dd>
              <dt>Status</dt><dd><StatusBadge value={details.status} /></dd>
              <dt>Processed path</dt><dd>{details.processedPath || '-'}</dd>
              <dt>Error</dt><dd>{details.errorMessage || '-'}</dd>
            </dl>
          ) : (
            <p>Select a file to view details.</p>
          )}
        </article>
      </section>
    </main>
  );
}
