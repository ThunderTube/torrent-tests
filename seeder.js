const fs = require("fs");
const { join } = require("path");

const { getMovies } = require("./get-movies");

async function app() {
  try {
    const movies = await getMovies();

    // TODO: Replace with a MongoDB populating
    fs.writeFileSync(join(__dirname, "./db.json"), JSON.stringify(movies));

    console.log("> Saved the movies to ./db.json");
  } catch (e) {
    console.error(e);
  }
}

app();
