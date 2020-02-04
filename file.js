const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const {
  // promises: { stat }
} = require("fs");
const { join, extname } = require("path");
const stream = require("stream");
const { promisify } = require("util");

const pipeline = promisify(stream.pipeline);

const SUPPORTED_EXTENSIONS = new Set(["mp4", "webm"]);

function transcode(extension, stream) {
  if (SUPPORTED_EXTENSIONS.has(extension)) {
    return stream;
  }

  // Transcode the video stream to a WebM stream
  // Cf. https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/274
  return ffmpeg(stream)
    .on("start", () => console.log("start transcoding"))
    .on("error", error => console.error("error during transcoding", error))
    .format("webm")
    .withVideoCodec("libvpx")
    .addOptions(["-qmin 0", "-qmax 50", "-crf 5"])
    .withVideoBitrate(1024)
    .withAudioCodec("libvorbis")
    .stream();
}

class TorrentFile {
  constructor(file, basePath) {
    this._file = file;
    this._finishedFSDownloading = false;
    this._fsPath = join(basePath, file.path);
    this._extension = extname(file.path).slice(1);
  }

  get path() {
    return this._file.path;
  }

  pipe(writeStream) {
    let readStream = null;

    if (this._finishedFSDownloading === true) {
      // get the file from the FS
      readStream = fs.createReadStream(this._fsPath);
    } else {
      // use the torrent stream
      readStream = this._file.createReadStream();
    }

    return pipeline(this._transcode(readStream), writeStream);
  }

  _transcode(stream) {
    return transcode(this._extension, stream);
  }

  async _finishDownloading() {
    // const { size: fileSize } = await stat(this._fsPath);

    this._finishedFSDownloading = true;
  }
}

class FSFile {
  constructor(path) {
    this._path = join(__dirname, "./movies", path);
    this._extension = extname(path).slice(1);
  }

  get path() {
    return this._path;
  }

  pipe(writeStream) {
    const stream = fs.createReadStream(this._path);

    return pipeline(this._transcode(stream), writeStream);
  }

  _transcode(stream) {
    return transcode(this._extension, stream);
  }
}

module.exports.TorrentFile = TorrentFile;
module.exports.FSFile = FSFile;
