const got = require("got");
const popcorn = require("popcorn-api");
const fs = require("fs");
const { join } = require("path");
const Joi = require("@hapi/joi");

const { Torrent } = require("./torrent");

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
  if (!Array.isArray(torrents) || torrents.length === 0) {
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
    torrents: torrents.map(({ hash, quality, seeds, peers, size_bytes }) => ({
      resolution: quality,
      url: `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}`,
      seeds,
      peers,
      size: size_bytes
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
  images,
  images: { poster } = {},
  torrents
}) {
  const { en: englishTorrents } = torrents;
  const finalTorrentsArray = [];

  if (englishTorrents === undefined) {
    console.error("Could not find english torrents for", imdbID);
    return null;
  }
  if (poster === undefined) {
    console.error("Could not get the poster for", imdbID, images);
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

  if (finalTorrentsArray.length === 0) {
    return null;
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
  const FETCHERS = [fetchMoviesFromPopcornTime, fetchMoviesFromYTS];

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
  const MAX_CHUNK_LENGTH = 100;
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
    const [{ vote_average, poster_path }, { cast, crew }] = await Promise.all(
      ["", "/credits"].map(url =>
        got(`https://api.themoviedb.org/3/movie/${movie._id}${url}`, {
          searchParams: {
            api_key: process.env.TMDB_API_KEY
          }
        }).json()
      )
    );

    const image =
      movie.image && movie.image.startsWith("http")
        ? movie.image
        : toTMDBImage(poster_path);

    if (image === null) {
      console.error("Could not get a picture for this movie", movie._id);
      return null;
    }

    return {
      ...movie,
      rating: vote_average,
      cast: cast.map(({ character, name, profile_path }) => ({
        character,
        name,
        profile: profile_path && toTMDBImage(profile_path)
      })),
      crew: crew.map(({ name, job }) => ({ name, job })),
      image
    };
  } catch (e) {
    console.error(e, movie._id, movie.origin);
    return null;
  }
}

function toTMDBImage(path) {
  if (!path) return null;

  return `https://image.tmdb.org/t/p/w500${path}`;
}

function checkDBEntriesIntegrity() {
  const MOVIES = require("./db.json");

  const schema = Joi.array()
    .items(
      Joi.object({
        _id: Joi.string().required(),
        origin: Object.values(MOVIES_ORIGINS), // OR `Popcorn`
        title: Joi.string().required(),
        description: Joi.string()
          .allow("")
          .required(),
        language: "en",
        year: [null, Joi.number()],
        genres: Joi.array()
          .items(Joi.string())
          .required(),
        crew: Joi.array()
          .items(
            Joi.object({
              name: Joi.string().required(),
              job: Joi.string().required()
            })
          )
          .required(),
        cast: Joi.array()
          .items(
            Joi.object({
              character: Joi.string()
                .allow("")
                .required(),
              name: Joi.string().required(),
              profile: [null, Joi.string()]
            })
          )
          .required(),
        image: Joi.string()
          .uri()
          .required(), // poster_path
        rating: Joi.number()
          .min(0)
          .max(10)
          .required(), // vote_average
        runtime: Joi.number()
          .integer()
          .min(0)
          .required(), // movie duration
        torrents: Joi.array()
          .items(
            Joi.object({
              resolution: Joi.string().required(),
              url: Joi.string().required(),
              seeds: Joi.number()
                .integer()
                .min(0)
                .required(),
              peers: Joi.number()
                .integer()
                .min(0)
                .required(),
              size: Joi.number()
                .integer()
                .min(0)
            })
          )
          .min(1)
          .required()
      })
    )
    .min(0)
    .required();

  const { error } = schema.validate(MOVIES);
  if (error !== undefined) {
    throw new Error(error);
  }
}

async function app() {
  // try {
  //   checkDBEntriesIntegrity();

  //   console.log("All entries are correct");
  // } catch (e) {
  //   console.error(e);
  // }

  getMovies().then(() => console.log("> Saved the movies to ./db.json"));
}

app().catch(console.error);

// module.exports.MOVIES = MOVIES;
module.exports.fetchMoviesFromYTS = fetchMoviesFromYTS;
module.exports.fetchMoviesFromPopcornTime = fetchMoviesFromPopcornTime;
module.exports.streamTorrent = streamTorrent;
