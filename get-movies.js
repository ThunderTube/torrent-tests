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

  return tor.download();
}

module.exports.MOVIES = MOVIES
module.exports.fetchMovies = fetchMovies
module.exports.streamTorrent = streamTorrent
