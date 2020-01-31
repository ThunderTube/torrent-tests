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

const PORT = 3096;

const STATE = {
  files: new Map()
};

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

      // Use ffmpeg on it.
      ffmpeg(file.createReadStream())
        .videoCodec("libx264")
        .audioCode("aac")
        .format("hls")
        .outputOptions(["-hls_time 6", "-hls_playlist_type event"])
        .save(join(__dirname, "./files", "stream.m3u8"));

      STATE.files.set(id, file);

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
        params: { id, resolution },
        headers: { range }
      } = req;
      const [min, max] = range.slice(6, -1).split("-");

      try {
        const file = STATE.files.get(id);
        if (file === undefined) {
          send(res, 404);
          return;
        }
        // const filePath = await Movie.getTorrentFSPath({
        //   imdbId: id,
        //   resolution
        // });
        // const localFilePath = join(__dirname, "./movies", filePath);
        // const fileStats = await stat(localFilePath);
        // const fileSize = fileStats.size;

        const start = Number(min);
        const end = max ? Number(max) : file.length;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${file.length}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": "video/mp4"
        });
        file
          .createReadStream({
            start,
            end
          })
          .pipe(res);
      } catch (e) {
        console.error(e);
        send(res, 500);
      }
    })
    .listen(PORT, err => {
      if (err) throw err;

      console.log(`> Running on localhost:${PORT}`);
    });
}

app().catch(console.error);
