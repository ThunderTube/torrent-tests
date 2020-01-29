const polka = require("polka");
const send = require("@polka/send-type");

const MOVIES = require("./db.json");
const { streamTorrent } = require("./stream");

const PORT = 3096;

const STATE = {};

polka()
  .get("/videos", (req, res) => {
    send(res, 200, MOVIES);
  })
  .get("/video/:id", (req, res) => {
    const movie = MOVIES.find(({ _id }) => _id === req.params.id);

    send(res, movie === undefined ? 404 : 200, movie);
  })
  .get("/download-video/:id", async (req, res) => {
    const {
      params: { id }
    } = req;

    const movie = MOVIES.find(({ imdb_code }) => imdb_code === id);
    if (movie === undefined) {
      res.end("Not found");
      return;
    }

    const { emitter, data } = await streamTorrent(movie);

    emitter.on("launch", () => {
      console.log("launch streaming");
    });

    res.end(`request the downloading of video ${id}`);
  })
  .listen(PORT, err => {
    if (err) throw err;

    console.log(`> Running on localhost:${PORT}`);
  });
