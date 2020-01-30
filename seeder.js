const fs = require("fs");
const { join } = require("path");

const { getMovies } = require("./get-movies");
const connectDB = require("./db");
const { Movie } = require("./models/movie");

async function app() {
  try {
    await connectDB();

    const movies = await getMovies();

    // Drop the collection efficiently (data + indexes) and then recreate the indexes.
    await Movie.collection.drop();
    await Movie.syncIndexes();

    await Movie.collection.insertMany(movies);

    console.log("> Saved the movies to MongoDB");

    process.exit(0);
  } catch (e) {
    console.error(e);

    process.exit(255);
  }
}

app();
