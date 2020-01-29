const polka = require("polka");
const send = require("@polka/send-type");

const MOVIES = require("./db.json");
const { getSubtitles } = require("./get-movies");
const { streamTorrent } = require("./stream");

const PORT = 3096;

const STATE = {
  sse: new Map()
};

polka()
  .get("/videos", (req, res) => {
    send(res, 200, MOVIES);
  })
  .get("/video/:id", async (req, res) => {
    try {
      const movie = MOVIES.find(({ _id }) => _id === req.params.id);
      if (movie === undefined) {
        send(res, 404);
        return;
      }

      send(res, 200, {
        ...movie,
        subtitles: await getSubtitles(movie._id)
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

    const movie = MOVIES.find(({ _id }) => _id === id);
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

    console.log("data", data);

    emitter.on("launch", () => {
      console.log("launch streaming");
    });

    res.end(`request the downloading of video ${id}`);
  })
  .listen(PORT, err => {
    if (err) throw err;

    console.log(`> Running on localhost:${PORT}`);
  });
