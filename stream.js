const { Torrent } = require("./torrent");

async function streamTorrent(movie) {
  const {
    title,
    torrents: [torrent]
  } = movie;
  const { hash } = torrent;

  const magnetLink = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(
    title
  )}`;

  const tor = new Torrent(magnetLink);

  return tor.download();
}

module.exports.streamTorrent = streamTorrent;
