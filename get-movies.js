const got = require("got");
const fs = require("fs");
const { join } = require("path");

const { Torrent } = require("./torrent");

const MOVIES = JSON.parse(fs.readFileSync(join(__dirname, "./movies.json")));

async function fetchMovies(prevMovies = [], page = 1) {
  const LIMIT = 50;

  const { status, status_message, data } = await got(
    "https://yts.lt/api/v2/list_movies.json",
    {
      searchParams: {
        page,
        limit: LIMIT
      }
    }
  ).json();

  if (status !== "ok") {
    throw new Error("Bad response : " + status_message);
  }

  const {
    movie_count,
    limit,
    movies,
    movies: { length: moviesCount }
  } = data;

  if (moviesCount < limit) {
    return [...prevMovies, ...movies];
  }

  return fetchMovies([...prevMovies, ...movies], page + 1);
}

async function streamTorrent(movie) {
  const {
    title,
    torrents: [torrent]
  } = movie;
  const { hash } = torrent;

  const magnetLink = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(
    title
  )}`;

  const tor = new Torrent(magnetLink);

  const files = await tor.download();

  files.forEach((file, index) => {
    console.log(`${index} => ${file.name}/${file.length}B`);

    const stream = file.createReadStream();

    stream.pipe(fs.createWriteStream(join(__dirname, file.name)));
  });
}

async function app() {
  const movie = MOVIES[663];

  console.log("movie =", movie);

  return streamTorrent(movie);
}

app().catch(console.error);
