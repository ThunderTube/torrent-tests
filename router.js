const polka = require("polka");
const send = require("@polka/send-type");

const MOVIES = require("./db.json");
const { getSubtitles } = require("./get-movies");
const { streamTorrent } = require("./stream");

const PORT = 3096;

const STATE = {
  videos: new Map()
};

polka()
  .get("/videos", (req, res) => {
    send(res, 200, MOVIES);
  })
  .get("/video/:id", async (req, res) => {
    try {
      const movie = MOVIES.find(({ imdbId }) => imdbId === req.params.id);
      if (movie === undefined) {
        send(res, 404);
        return;
      }

      send(res, 200, {
        ...movie,
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

    const movie = MOVIES.find(({ imdbId }) => imdbId === id);
    if (movie === undefined) {
      res.end("Not found");
      return;
    }

    const torrent = movie.torrents.find(
      ({ resolution: torrentResolution }) => torrentResolution === resolution
    );
    if (torrent === undefined) {
      send(res, 404);
      return;
    }

    const { emitter, data } = await streamTorrent(torrent);
    STATE.videos.set(id, "LOADING");

    console.log("data", data);

    emitter.on("launch", () => {
      console.log("launch streaming");
      STATE.videos.set(id, "LOADED");
    });

    send(res, 200, "SUCCESS");
  })
  .get("/video/status/:id", (req, res) => {
    const {
      params: { id }
    } = req;
    if (!id) {
      send(res, 400);
      return;
    }

    const status = STATE.videos.get(id);
    send(res, status === undefined ? 404 : 200, status);
  })
  .listen(PORT, err => {
    if (err) throw err;

    console.log(`> Running on localhost:${PORT}`);
  });
