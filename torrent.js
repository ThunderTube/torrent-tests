const torrentStream = require("torrent-stream");
const { join } = require("path");
const EventEmitter = require("events");

const MIN_STREAMING_AUTHORIZATION = 10;

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
  }

  download() {
    const loadedChunks = new Set();
    const emitter = new EventEmitter();
    let piecesCount = 0;
    let permittedDownloading = false;

    return new Promise((resolve, reject) => {
      this._engine.on("ready", () => {
        const matchingFiles = this._engine.files.filter(({ name }) =>
          this._AUTHORIZED_EXTENSIONS.some(ext => name.endsWith(ext))
        );

        matchingFiles.forEach(file => file.select());

        resolve({
          emitter,
          data: matchingFiles
        });
      });

      this._engine.on("torrent", ({ pieces }) => {
        piecesCount = pieces.length;
        console.log("pieces length = ", pieces.length);
      });

      this._engine.on("download", index => {
        loadedChunks.add(index);

        const percent =
          (100 * lastContinuousElement([...loadedChunks])) / piecesCount;

        if (percent >= MIN_STREAMING_AUTHORIZATION) {
          emitter.emit("launch");
          permittedDownloading = true;
        }

        console.log("downloading ...", percent);
      });
    });
  }

  destroy() {
    this._engine.destroy();
  }
}

module.exports.Torrent = Torrent;
