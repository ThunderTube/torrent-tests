const { FSFile } = require("./file");
const fs = require("fs");
const { join } = require("path");

async function app() {
  const file = new FSFile("test.vob");

  await file.pipe(fs.createWriteStream(join(__dirname, "./movies/test.webm")));
}

app().catch(console.error);
