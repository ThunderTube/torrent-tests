const polka = require("polka");
const send = require("@polka/send-type");
const sirv = require("sirv");
const compress = require("compression")();
const ffmpeg = require("fluent-ffmpeg");
const { join } = require("path");

const connectDB = require("./db");
const { getSubtitles } = require("./get-movies");
const { streamTorrent } = require("./stream");
const { Movie, TORRENT_STATUSES } = require("./models/movie");
const { FSFile } = require("./file");

const PORT = 3096;

const STATE = {
  files: new Map()
};

function toFilesMapKey(id, resolution) {
  return `${id}|${resolution}`;
}

async function getMovieStream(id, resolution) {
  try {
    const torrentFile = STATE.files.get(toFilesMapKey(id, resolution));
    if (torrentFile !== undefined) {
      console.info("use torrent stream");
      return torrentFile;
    }

    const fsPath = await Movie.getTorrentFSPath({ imdbId: id, resolution });
    if (fsPath === undefined) return undefined;

    console.info("use file stream");
    return new FSFile(fsPath);
  } catch (e) {
    console.error(e);
    return undefined;
  }
}

async function app() {
  await connectDB();

  setupRouter();
}

function setupRouter() {
  const assets = sirv("public", {
    maxAge: 31536000, // 1Y
    immutable: true
  });

  polka()
    .use(compress, assets)
    .get("/videos/:offset/:limit", async (req, res) => {
      const {
        params: { offset, limit }
      } = req;
      if (
        offset === undefined ||
        limit === undefined ||
        offset < 0 ||
        limit < 0
      ) {
        send(res, 400);
        return;
      }

      try {
        const movies = await Movie.find()
          .skip(Number(offset))
          .limit(Number(limit));

        send(res, 200, movies);
      } catch (e) {
        console.error(e);
        send(res, 500);
      }
    })
    .get("/video/:id", async (req, res) => {
      try {
        const movie = await Movie.findOne({ imdbId: req.params.id });
        if (!movie) {
          send(res, 404);
          return;
        }

        send(res, 200, {
          ...movie.toObject(),
          subtitles: await getSubtitles(movie.imdbId)
        });
      } catch (e) {
        console.error(e);
        send(res, 500);
      }
    })
    .get("/download-video/:id/:resolution", async (req, res) => {
      const {
        params: { id, resolution }
      } = req;
      if (!(id && resolution)) {
        send(res, 400);
        return;
      }

      const movie = await Movie.findOne(
        {
          imdbId: id,
          torrents: { $elemMatch: { resolution } }
        },
        {
          torrents: { $elemMatch: { resolution } }
        }
      );
      if (!movie) {
        res.end("Not found");
        return;
      }

      const {
        _id,
        torrents: [torrent]
      } = movie;
      const { fsPath, status } = torrent;

      if (fsPath !== undefined && status === TORRENT_STATUSES.LOADED) {
        // Load the movie from the local file system.
        send(res, 200, TORRENT_STATUSES.LOADED);
        return;
      }
      if (status === TORRENT_STATUSES.FIRST_CHUNKS_LOADED) {
        // Can launch polling.
        send(res, 200, TORRENT_STATUSES.FIRST_CHUNKS_LOADED);
        return;
      }
      if (status === TORRENT_STATUSES.LOADING) {
        send(res, 200, TORRENT_STATUSES.LOADING);
        return;
      }

      await Movie.lock({
        imdbId: id,
        resolution
      });

      // Lock the torrent.
      // Start downloading the movie.

      const { emitter, file } = await streamTorrent(torrent);

      STATE.files.set(toFilesMapKey(id, resolution), file);

      emitter.on("launch", async () => {
        console.log("launch streaming");

        try {
          await Movie.loadedFirstChunks({
            imdbId: id,
            resolution,
            path: file.path
          });
        } catch (e) {
          console.error(e);
        }
      });

      emitter.on("end", async () => {
        try {
          await Movie.finishedUploading({
            imdbId: id,
            resolution
          });
        } catch (e) {
          console.error(e);
        }
      });

      send(res, 200, TORRENT_STATUSES.LOADING);
    })
    .get("/video/status/:id/:resolution", async (req, res) => {
      const {
        params: { id, resolution }
      } = req;
      if (!id) {
        send(res, 400);
        return;
      }

      try {
        const status = await Movie.getTorrentStatus({
          imdbId: id,
          resolution
        });

        send(res, status === undefined ? 404 : 200, status);
      } catch (e) {
        console.error(e);
        send(res, 500);
      }
    })
    .get("/video/chunks/:id/:resolution", async (req, res) => {
      const {
        params: { id, resolution }
      } = req;

      try {
        const file = await getMovieStream(id, resolution);
        if (file === undefined) {
          send(res, 404);
          return;
        }

        await file.pipe(res);
      } catch (e) {
        if (e.code !== "ERR_STREAM_PREMATURE_CLOSE") {
          console.error(e);
          send(res, 500);
          return;
        }
      }
    })
    .listen(PORT, err => {
      if (err) throw err;

      console.log(`> Running on http://localhost:${PORT}`);
    });
}

app().catch(console.error);
