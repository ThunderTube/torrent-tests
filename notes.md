# Notes about streaming and scrapping

## Getting informations about a movie

```sh
curl https://api.themoviedb.org/3/movie/<imdb id>\?api_key\=<API KEY>
```

## Getting movie credits

```sh
curl https://api.themoviedb.org/3/movie/<imdb id>/credits\?api_key\=<API KEY>
```

### Getting a picture for cast/crew members

To get the picture of a profile, take the `profile_path` property and put it in the following query :

```sh
curl https://image.tmdb.org/t/p/w500/<profile_path>
```

## Get movies on PopcornTime

We can use [this Node.js library](https://popcorn-api.js.org/) to get movies from PopcornTime.

## Get the subtitles of a movie

Thanks to OpenSubtitles we can get the subtitles for a movie in a lot of languages.
[This Node.js library](https://www.npmjs.com/package/opensubtitles-api) permits to get them easily.

```js
const OS = require("opensubtitles-api");

const OpenSubtitles = new OS({
  useragent: "TemporaryUserAgent",
  ssl: true
});

OpenSubtitles.search({
  imdbid: "tt7286456"
})
  .then(subtitles => {
    console.log(subtitles);

    /**
      {
        "en": {
          "url": "https://dl.opensubtitles.org/en/download/src-api/vrf-19b90c50/sid-XSG7P-mvbMDviCLwWh0ezbolv71/filead/1956541350",
          "langcode": "en",
          "downloads": 1330319,
          "lang": "English",
          "encoding": "UTF-8",
          "id": "1956541350",
          "filename": "Joker.2019.720p.HC.HDRip.XviD.AC3-EVO.srt",
          "date": "2019-11-10 01:38:47",
          "score": 0.5,
          "fps": 30,
          "format": "srt",
          "utf8": "https://dl.opensubtitles.org/en/download/subencoding-utf8/src-api/vrf-19b90c50/sid-XSG7P-mvbMDviCLwWh0ezbolv71/filead/1956541350",
          "vtt": "https://dl.opensubtitles.org/en/download/subformat-vtt/src-api/vrf-19b90c50/sid-XSG7P-mvbMDviCLwWh0ezbolv71/filead/1956541350"
        },
        "pb": {
          "url": "https://dl.opensubtitles.org/en/download/src-api/vrf-19d40c5b/sid-XSG7P-mvbMDviCLwWh0ezbolv71/filead/1956552764",
          "langcode": "pb",
          "downloads": 102481,
          "lang": "Portuguese (BR)",
          "encoding": "CP1252",
          "id": "1956552764",
          "filename": "Joker.2019.1080p.KORSUB.HDRip.x264.AAC2.0-STUTTERSHIT.srt",
          "date": "2019-11-18 02:09:44",
          "score": 0.5,
          "fps": 23.976,
          "format": "srt",
          "utf8": "https://dl.opensubtitles.org/en/download/subencoding-utf8/src-api/vrf-19d40c5b/sid-XSG7P-mvbMDviCLwWh0ezbolv71/filead/1956552764",
          "vtt": "https://dl.opensubtitles.org/en/download/subformat-vtt/src-api/vrf-19d40c5b/sid-XSG7P-mvbMDviCLwWh0ezbolv71/filead/1956552764"
        },
        ...
      }
     */
  })
  .catch(console.error);
```

The subtitles links can directly be used on the client side and be put into the `src` attribute of the [track tag](https://developer.mozilla.org/fr/docs/Web/HTML/Element/track).
