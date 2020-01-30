const mongoose = require("mongoose");

const { MOVIES_ORIGINS } = require("../get-movies");

const movieSchema = new mongoose.Schema({
  _id: mongoose.ObjectId,
  imdbId: {
    type: String,
    index: true,
    unique: true
  },
  origin: {
    type: String,
    enum: Object.values(MOVIES_ORIGINS)
  },
  title: String,
  description: String,
  language: {
    type: String,
    enum: ["en"]
  },
  year: Number,
  genres: [String],
  crew: [
    {
      name: String,
      job: String
    }
  ],
  cast: [
    {
      character: String,
      name: String,
      profile: String
    }
  ],
  image: String,
  rating: {
    type: Number,
    min: 0,
    max: 10
  },
  runtime: {
    type: Number,
    min: 0
  },
  torrents: [
    {
      resolution: String,
      url: String,
      seeds: {
        type: Number,
        min: 0
      },
      peers: {
        type: Number,
        min: 0
      },
      size: {
        type: Number,
        min: 0
      }
    }
  ]
});

// Create a text index to speed up searchs by `title` field.
movieSchema.index({ title: "text" });

module.exports.Movie = mongoose.model("Movie", movieSchema);
