# MP4 processing technical task

This repository implements the requested architecture:

- **API service (Node.js + Express)**
- **Processing service (Golang)**
- **NATS** for inter-service communication
- **SQL persistence** with PostgreSQL
- **React SPA** for upload and status tracking

The sample input file is available at:

- `/home/runner/work/unicast-tehnical-task/unicast-tehnical-task/.task-material/video.mp4`

## API service endpoints

- `GET /files` - list all files and statuses
- `GET /files/:id` - get details for one file
- `POST /files/process` - queue processing from absolute path
  - body: `{ "filePath": "/absolute/path/to/file.mp4" }`
- `POST /files/upload` - upload `multipart/form-data` field `file` and queue processing
- `DELETE /files/:id` - delete DB record and processed init segment file

Statuses:

- `Processing`
- `Successful`
- `Failed`

## MP4 processing behavior

The processing service expects the first two MP4 boxes to be:

1. `ftyp`
2. `moov`

Those two boxes are extracted and written into a new output file `<original>.init.mp4`, then a NATS result message is sent to the API service.

## Run with Docker Compose

```bash
docker compose up --build
```

### Expected volume mounts

- `./api-service/uploads:/app/uploads` stores uploaded files from SPA/API
- `./api-service/processed:/app/processed` stores extracted initialization segments
- `./:/workspace:ro` provides read-only access to repository files for absolute-path processing

### Service data storage

- `postgres_data` Docker volume stores PostgreSQL data

After startup:

- API: `http://localhost:3000`
- SPA: `http://localhost:5173`
- NATS: `nats://localhost:4222`
- PostgreSQL: `postgresql://postgres:postgres@localhost:5432/unicast`

## Run locally (without Docker)

### API service

```bash
cd api-service
npm install
npm start
```

### Processing service

```bash
cd processing-service
go run ./cmd/processor
```

### SPA

```bash
cd spa
npm install
npm run dev
```

Set SPA API target if needed:

```bash
VITE_API_BASE_URL=http://localhost:3000 npm run dev
```

## Test commands

```bash
cd api-service && npm test
cd processing-service && go test ./...
cd spa && npm test
```

## Additional notes

- Upload support (`POST /files/upload`) was added for easier SPA integration.
- The source MP4 file is not deleted by `DELETE /files/:id`; only stored metadata and extracted processing output are removed.
- No known unresolved issues.
