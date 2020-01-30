const got = require("got");
const popcorn = require("popcorn-api");
const Joi = require("@hapi/joi");
const OS = require("opensubtitles-api");

const MOVIES_ORIGINS = {
  POPCORN_TIME: "POPCORN_TIME",
  YTS: "YTS"
};

async function fetchMoviesFromYTS(prevMovies = [], page = 1) {
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
    imdbId: imdb_code,
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
    imdbId: imdbID,
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

  checkDBEntriesIntegrity(movies);

  return movies;
}

function removeDuplicates(movies) {
  const moviesWithoutDuplicates = [];
  const foundIds = new Set();

  for (const movie of movies) {
    if (foundIds.has(movie.imdbId)) continue;

    moviesWithoutDuplicates.push(movie);

    foundIds.add(movie.imdbId);
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
        got(`https://api.themoviedb.org/3/movie/${movie.imdbId}${url}`, {
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
      console.error("Could not get a picture for this movie", movie.imdbId);
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
    if (e.response && e.response.statusCode === 404) {
      console.error(`Could not find ${movie.imdbId} on IMDB`);
      return null;
    }

    console.error(e, movie.imdbId, movie.origin);
    return null;
  }
}

function toTMDBImage(path) {
  if (!path) return null;

  return `https://image.tmdb.org/t/p/w500${path}`;
}

function checkDBEntriesIntegrity(movies) {
  const schema = Joi.array()
    .items(
      Joi.object({
        imdbId: Joi.string().required(),
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

  const { error } = schema.validate(movies);
  if (error !== undefined) {
    throw new Error(error);
  }
}

async function getSubtitles(id) {
  const OpenSubtitles = new OS({
    useragent: "TemporaryUserAgent",
    ssl: true
  });

  const subtitles = await OpenSubtitles.search({
    imdbid: id
  });

  return Object.values(subtitles).map(
    ({ url, langcode, lang, encoding, score }) => ({
      url,
      langcode,
      lang,
      encoding,
      score
    })
  );
}

module.exports.MOVIES_ORIGINS = MOVIES_ORIGINS;
module.exports.getMovies = getMovies;
module.exports.getSubtitles = getSubtitles;
