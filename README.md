# podcast-testcasts

A tiny, disposable podcast server for testing podcast clients. You POST a JSON
configuration describing your podcasts, and it immediately serves:

- a synthesized **RSS feed** per podcast, with the iTunes podcast extensions,
- a **2 minute silent MP3** (128 kbit/s, 44.1 kHz, stereo) for every episode.

No authentication. No database. Config lives in memory and is replaced on every
`POST /config`.

## Quick start

### Docker

```bash
docker build -t podcast-testcasts .
docker run --rm -p 5004:5004 podcast-testcasts
```

Or with Compose:

```bash
docker compose up --build
# host port is configurable: PORT=8080 docker compose up --build
```

Then load a configuration:

```bash
curl -X POST http://localhost:5004/config \
  -H 'content-type: application/json' \
  --data @examples/config.json
```

Or use the helper script, which posts `examples/config.json` and prints the
resulting feed URLs:

```bash
./scripts/load-example.sh                              # http://localhost:5004
./scripts/load-example.sh http://192.168.1.10:5004     # custom base URL
./scripts/load-example.sh http://localhost:5004 other.json
./scripts/load-example.sh --help
```

See [`usage.md`](usage.md) for a detailed reference (arguments, exit codes,
troubleshooting) aimed at automated callers.

Point your podcast client at `http://localhost:5004/the-test-show.rss`.

### Local (no Docker)

```bash
npm install
npm run dev        # or: npm run build && npm start
npm test
```

## API

| Method | Path                     | Description                                              |
| ------ | ------------------------ | -------------------------------------------------------- |
| `POST` | `/config`                | Replace the configuration with the posted JSON.          |
| `GET`  | `/{podcast-slug}.rss`    | Synthesized RSS 2.0 feed for that podcast.               |
| `GET`  | `/{episode-mp3-slug}`    | The 2 minute silent MP3. Supports `Range`/`HEAD`.        |
| `GET`  | `/health`                | `{ status, podcasts, episodes }`.                        |
| `GET`  | `/`                      | Plain-text usage summary.                                |

### `POST /config`

Send a JSON array of podcasts (an object with a `podcasts` array also works).
Every `POST` **replaces** the previous configuration.

```json
[
  {
    "slug": "the-test-show",
    "name": "The Test Show",
    "coverUrl": "https://example.com/cover.jpg",
    "description": "A synthetic podcast.",
    "episodes": [
      {
        "title": "Episode 1",
        "description": "The first one.",
        "coverUrl": "https://example.com/ep1.jpg",
        "mp3Slug": "the-test-show-ep1.mp3"
      }
    ]
  }
]
```

Fields:

| Field          | Required | Notes                                                        |
| -------------- | -------- | ------------------------------------------------------------ |
| `slug`         | yes      | Unique. The feed is served at `/{slug}.rss`.                 |
| `name`         | yes      | Podcast title.                                               |
| `coverUrl`     | no       | Podcast artwork URL.                                         |
| `description`  | no       | Podcast summary.                                             |
| `episodes`     | no       | Array; defaults to empty.                                    |
| `title`        | yes*     | *Episode field. Episode title.                               |
| `mp3Slug`      | yes*     | *Episode field. Must be unique **across all podcasts**.      |
| `description`  | no*      | *Episode show notes.                                         |
| `coverUrl`     | no*      | *Episode artwork; falls back to the podcast cover.           |

For convenience, snake_case and a few common synonyms are accepted
(`cover_url`, `mp3_slug`, `audioSlug`, `summary`, `image`, ...). Invalid input
returns `400` with a `details` array listing every problem found.

A successful post returns:

```json
{ "ok": true, "podcasts": 2, "episodes": 3 }
```

### Feed behaviour

- Enclosure URLs point back at this server (`{base}/{mp3Slug}`), so the feed is
  self-contained; cover images are linked exactly as configured.
- The newest episode is dated at config time; each following episode steps back
  one day.
- Enclosure `length` matches the served MP3 byte length.

## Configuration

| Env var           | Default   | Description                                                        |
| ----------------- | --------- | ------------------------------------------------------------------ |
| `PORT`            | `5004`    | Listen port.                                                       |
| `HOST`            | `0.0.0.0` | Listen address.                                                    |
| `PUBLIC_BASE_URL` | *(auto)*  | Base URL for feed/enclosure links. Defaults to the request host.   |

Set `PUBLIC_BASE_URL` when the server is reached through a proxy or a hostname
the client can't otherwise infer (e.g. `PUBLIC_BASE_URL=http://192.168.1.10:5004`).

## Notes

- Configuration is **in-memory only**: restarting the container clears it. Re-post
  your config after a restart.
- The silent MP3 is generated in-process (no ffmpeg/lame needed) and cached.
- Every episode is the same silent audio; only the feed metadata differs.

## Publishing

Build and push to Docker Hub as `kaiwegner/ohrbob.testcasts`:

```bash
./scripts/publish.sh              # tags :latest
./scripts/publish.sh 1.2.0        # tags :1.2.0
IMAGE=myuser/my-image ./scripts/publish.sh 1.2.0
```

Authenticate with a Docker Hub personal access token instead of an interactive
`docker login`. Pass the username and token as flags, or via `DOCKERHUB_USER` and
`DOCKERHUB_PAT`; flags win over the environment:

```bash
DOCKERHUB_USER=kaiwegner DOCKERHUB_PAT=... ./scripts/publish.sh 1.2.0
./scripts/publish.sh --user kaiwegner --token ... 1.2.0
```

The image is built first; the login happens after the build, right before the
push. The login runs against a throwaway docker config dir, so your own
`~/.docker/config.json` is left untouched. Supply neither and the script assumes
you already ran `docker login`.

The image is built for the host architecture (`linux/amd64` on an x86-64
machine); a single-arch image is all that's needed.

## Development

```bash
npm test        # unit + HTTP integration tests (node:test via tsx)
npm run typecheck
```
