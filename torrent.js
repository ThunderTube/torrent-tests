const torrentStream = require("torrent-stream");
const { join } = require("path");
const EventEmitter = require("events");

const MIN_STREAMING_AUTHORIZATION = 20;

function lastContinuousElement(elements) {
  const sortedElements = [...elements].sort((a, b) => a - b);
  let last = 0;

  for (const chunk of sortedElements) {
    last = chunk;

    if (!sortedElements.includes(chunk + 1)) return last;
  }
  return last;
}

class Torrent {
  constructor(magnetUrn) {
    this._engine = torrentStream(magnetUrn, {
      path: join(__dirname, "./movies"),
      trackers: [
        "udp://open.demonii.com:1337/announce",
        "udp://tracker.openbittorrent.com:80",
        "udp://tracker.coppersurfer.tk:6969",
        "udp://glotorrents.pw:6969/announce",
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://torrent.gresille.org:80/announce",
        "udp://p4p.arenabg.com:1337",
        "udp://tracker.leechers-paradise.org:6969"
      ]
    });

    this._AUTHORIZED_EXTENSIONS = [".mp4", ".mkv"];
    this._file = [];
  }

  download() {
    const loadedChunks = new Set();
    const emitter = new EventEmitter();
    let piecesCount = 0;
    let downloadedBytesCount = 0;
    let permittedDownloading = false;

    return new Promise((resolve, reject) => {
      this._engine.on("ready", () => {
        this._file = this._engine.files.find(({ name }) =>
          this._AUTHORIZED_EXTENSIONS.some(ext => name.endsWith(ext))
        );

        this._file.select();

        resolve({
          emitter,
          file: this._file
        });
      });

      this._engine.on("torrent", ({ pieces }) => {
        piecesCount = pieces.length;
        console.log("pieces length = ", pieces.length);
      });

      this._engine.on("download", (index, buffer) => {
        downloadedBytesCount += buffer.length;

        loadedChunks.add(index);

        const lastEl = lastContinuousElement([...loadedChunks]);

        const percent = (100 * lastEl) / piecesCount;

        if (lastEl >= MIN_STREAMING_AUTHORIZATION && !permittedDownloading) {
          emitter.emit("launch");
          permittedDownloading = true;
        }

        console.log("downloading ...", percent);
      });

      this._engine.on("idle", () => {
        emitter.emit("end");
      });
    });
  }

  destroy() {
    this._engine.destroy();
  }
}

module.exports.Torrent = Torrent;
