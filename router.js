const polka = require("polka");

const { MOVIES, streamTorrent } = require("./get-movies");

const PORT = 3096;

polka()
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
