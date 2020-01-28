const got = require("got");
const popcorn = require("popcorn-api");
const fs = require("fs");
const { join } = require("path");

const { Torrent } = require("./torrent");

// const MOVIES = JSON.parse(fs.readFileSync(join(__dirname, "./movies.json")));

const MOVIES_ORIGINS = {
  POPCORN_TIME: "POPCORN_TIME",
  YTS: "YTS"
};

const MOVIE_EXAMPLE = {
  _id: "tt0076759",
  origin: MOVIES_ORIGINS.YTS, // OR `Popcorn`
  title: "",
  description: "",
  language: "English",
  year: 1977,
  genres: ["action"],
  crew: [
    {
      name: "Scott Silver",
      job: "Writer"
    }
  ],
  cast: [
    {
      character: "Arthur Fleck / Jocker",
      name: "Joaquin Phoenix",
      profile: "https://image.tmdb.org/t/p/w500/9N7FNKUhjtinrNPy8ANvXrB7iEr.jpg"
    }
  ],
  image: "https://image.tmdb.org/t/p/w500/n6bUvigpRFqSwmPp1m2YADdbRBc.jpg", // poster_path
  rating: 6.7, // vote_average
  runtime: 122, // movie duration
  torrents: [
    {
      resolution: "1080p",
      url: "magnet:...",
      language: " en",
      seeds: 1917,
      peers: 1917,
      size: 2132564654
    }
  ]
};

async function fetchMoviesFromYTS(prevMovies = [], page = 1) {
  console.log("> fetch movies from YTS", page);
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

  prevMovies.push(...movies);

  if (moviesCount < limit) {
    return prevMovies.map(formatMovieFromYTS);
  }

  return fetchMoviesFromYTS(prevMovies, page + 1);
}

function formatMovieFromYTS({
  imdb_code,
  title,
  year,
  runtime,
  genres,
  summary,
  language,
  medium_cover_image,
  torrents
}) {
  if (!Array.isArray(torrents)) {
    return null;
  }

  return {
    _id: imdb_code,
    origin: MOVIES_ORIGINS.YTS,
    title,
    description: summary,
    language: language === "English" ? "en" : language,
    year,
    genres,
    image: medium_cover_image,
    runtime,
    torrents: torrents.map(({ hash, quality, seeds, peers, size }) => ({
      resolution: quality,
      url: `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}`,
      seeds,
      peers,
      size
    }))
  };
}

async function fetchMoviesFromPopcornTime() {
  const pagesCount = await popcorn.movies.pages();
  const pages = [];

  for (let page = 1; page <= pagesCount; page++) {
    pages.push(
      popcorn.movies.search({
        page
      })
    );
  }

  const chunks = await Promise.all(pages);

  return chunks.flat().map(formatMovieFromPopcornTime);
}

function formatMovieFromPopcornTime({
  imdbID,
  title,
  year,
  synopsis,
  runtime,
  genres,
  images: { poster },
  torrents
}) {
  const { en: englishTorrents } = torrents;
  const finalTorrentsArray = [];

  if (englishTorrents === undefined) {
    console.error("Could not find english torrents for", imdbID);
    return null;
  }

  for (const [resolution, { url, seeds, peers, size }] of Object.entries(
    englishTorrents
  )) {
    finalTorrentsArray.push({
      resolution,
      url,
      seeds,
      peers,
      size
    });
  }

  return {
    _id: imdbID,
    origin: MOVIES_ORIGINS.POPCORN_TIME,
    title,
    description: synopsis,
    language: "en",
    year,
    genres,
    image: poster,
    rating: null,
    runtime: Number(runtime),
    torrents: finalTorrentsArray
  };
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

/**
 * `getMovies` fetches movies from two data providers.
 *
 * Procedure :
 * 1. Launch the bot fetchers
 * 2. Remove possible duplicates
 * 3. Return the movies
 */
async function getMovies() {
  const FETCHERS = [fetchMoviesFromYTS, fetchMoviesFromPopcornTime];

  const results = await Promise.all(FETCHERS.map(fn => fn()));
  const baseMovies = removeDuplicates(
    results.flat().filter(movie => movie !== null)
  );

  const movies = await completeMoviesInformations(baseMovies);

  fs.writeFileSync(
    join(__dirname, "./db.json"),
    JSON.stringify(movies, null, 2)
  );
}

getMovies()
  .then(() => console.log("filled db.json"))
  .catch(console.error);

function removeDuplicates(movies) {
  const moviesWithoutDuplicates = [];
  const foundIds = new Set();

  for (const movie of movies) {
    if (foundIds.has(movie._id)) continue;

    moviesWithoutDuplicates.push(movie);

    foundIds.add(movie._id);
  }

  return moviesWithoutDuplicates;
}

async function completeMoviesInformations(movies) {
  const MAX_CHUNK_LENGTH = 20;
  const chunks = [];
  const finalMovies = [];

  let min = 0;

  for (
    let index = 0;
    index < Math.trunc(movies.length / MAX_CHUNK_LENGTH);
    index++
  ) {
    chunks.push(movies.slice(min, min + MAX_CHUNK_LENGTH));
    min += MAX_CHUNK_LENGTH;
  }

  for (const chunk of chunks) {
    const completedMovies = await Promise.all(
      chunk.map(completeMovieInformations)
    );

    finalMovies.push(...completedMovies.filter(movie => movie !== null));
  }

  return finalMovies;
}

async function completeMovieInformations(movie) {
  try {
    const [{ vote_average }, { cast, crew }] = await Promise.all(
      ["", "/credits"].map(url =>
        got(`https://api.themoviedb.org/3/movie/${movie._id}${url}`, {
          searchParams: {
            api_key: process.env.TMDB_API_KEY
          }
        }).json()
      )
    );

    return {
      ...movie,
      rating: vote_average,
      cast,
      crew
    };
  } catch (e) {
    console.error(e, movie._id);
    return null;
  }
}

// module.exports.MOVIES = MOVIES;
module.exports.fetchMoviesFromYTS = fetchMoviesFromYTS;
module.exports.fetchMoviesFromPopcornTime = fetchMoviesFromPopcornTime;
module.exports.streamTorrent = streamTorrent;
