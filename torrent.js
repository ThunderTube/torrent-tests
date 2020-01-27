const torrentStream = require("torrent-stream");

class Torrent {
  constructor(magnetUrn) {
    this._engine = torrentStream(magnetUrn, {
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
    return new Promise((resolve, reject) => {
      this._engine.on("ready", () => {
        // const files = this.engine.files.map(file => file);

        resolve(
          this._engine.files.filter(({ name }) =>
            this._AUTHORIZED_EXTENSIONS.some(ext => name.endsWith(ext))
          )
        );
      });

      this._engine.on("download", (...args) => {
        console.log("download", ...args);
      });
    });
  }

  destroy() {
    this._engine.destroy();
  }
}

module.exports.Torrent = Torrent;
