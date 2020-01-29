const { Torrent } = require("./torrent");

async function streamTorrent({ url }) {
  const tor = new Torrent(url);

  return tor.download();
}

module.exports.streamTorrent = streamTorrent;
