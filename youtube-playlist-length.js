// ==UserScript==
// @name        Show Youtube playlist total length
// @namespace   Violentmonkey Scripts
// @match       https://www.youtube.com/playlist
// @match       https://www.youtube.com/watch
// @grant       GM_getValue
// @version     1.1
// @author      Rafael Botazini
// @downloadURL https://raw.githubusercontent.com/rafaelbotazini/user-scripts/main/youtube-playlist-length.js
// @description Shows the current playlist total length at the playlist description section
// ==/UserScript==

const API_KEY = GM_getValue('apiKey', '')

API_KEY && getPlaylistDuration()
  .then((result) => {
    if (!result) return

    const [duration, seconds] = result

    const at125 = parseDuration(Math.round(seconds / 1.25))
    const at150 = parseDuration(Math.round(seconds / 1.5))
    const at175 = parseDuration(Math.round(seconds / 1.75))
    const at200 = parseDuration(Math.round(seconds / 2))

    let title = `${at125} at 1.25x • ${at150} at 1.5x • ${at175} at 1.75x • ${at200} at 2x`
    let html = duration.toString()

    const $duration = document.createElement('yt-formatted-string')
    let $container

    // change elements based on location
    if (window.location.pathname.startsWith('/playlist')) {
      $container = document.getElementById('stats')
      copyClassList($container.firstElementChild, $duration)
    } else {
      $container = document.querySelector('ytd-playlist-panel-renderer:not([hidden]) #publisher-container')
      copyClassList($container.lastElementChild, $duration)
      html = '&nbsp;-&nbsp;' + html
    }

    $container.appendChild($duration)
    $duration.innerHTML = html
    $duration.title = title
  })
  .catch(console.error)

function copyClassList(sourceEl, targetEl) {
  const classes = sourceEl.classList.value.split(' ');
  DOMTokenList.prototype.add.apply(targetEl.classList, classes)
}

async function getPlaylistDuration() {
  const search = new URLSearchParams(window.location.search)
  const playlistId = search.get('list')

  if (!playlistId) return

  const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&fields=items/contentDetails/videoId,pageInfo,nextPageToken&key=${API_KEY}&playlistId=${playlistId}&pageToken=`
  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?&part=contentDetails&fields=items/contentDetails/duration&key=${API_KEY}&id=`

  let count = 0
  let totalDuration = 0
  let nextPageToken = ''
  let hasNext = false

  do {
    const playlistResponse = await fetch(playlistUrl + nextPageToken).then(r => r.json())
    const videoIds = playlistResponse.items.map(x => x.contentDetails.videoId)
    count += playlistResponse.items.length

    const videosResponse = await fetch(videosUrl + videoIds.join(',')).then(r => r.json())
    const durations = videosResponse.items.map(x => x.contentDetails.duration)

    const seconds = durations.reduce((acc, duration) => acc + parseDurationToSeconds(duration), 0)
    totalDuration += seconds
    nextPageToken = playlistResponse.nextPageToken
    // compare results to prevent infinite requests from radio playlists
    hasNext = nextPageToken && count < playlistResponse.pageInfo.totalResults
  } while (hasNext)

  const duration = parseDuration(totalDuration)

  // console.log(`Total playlist duration: ${duration}`)

  return [duration, totalDuration]
}

const DURATION_REGEX = /^P(?:(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?|(\d+)W)$/

const MINUTE_SECONDS = 60
const HOUR_SECONDS = 3600
const DAYS_SECONDS = 24 * 3600
const MONTH_SECONDS = 30 * 24 * 3600
const WEEK_SECONDS = 7 * 24 * 3600
const YEAR_SECONDS = 365 * 24 * 3600

function parseDurationToSeconds(durationIso) {
  let totalSeconds = 0
  durationIso.replace(DURATION_REGEX, (_, ...units) => {
    // parse number for each unit
    let [years, months, days, hours, minutes, seconds, weeks] = units.map((num) => parseInt(num, 10) || 0)

    totalSeconds = (years * YEAR_SECONDS) +
      (months * MONTH_SECONDS) +
      (days * DAYS_SECONDS) +
      (weeks * WEEK_SECONDS) +
      (hours * HOUR_SECONDS) +
      (minutes * MINUTE_SECONDS) +
      seconds
  });
  return totalSeconds
}

function parseDuration(seconds) {
  let duration = { year: 0, month: 0, day: 0, week: 0, hour: 0, minute: 0, second: 0, toString: durationToString }

  let remaining = seconds
  if (remaining % YEAR_SECONDS < remaining) {
    duration.year = Math.floor(remaining / YEAR_SECONDS)
    remaining -= duration.year * YEAR_SECONDS
  }
  if (remaining % MONTH_SECONDS < remaining) {
    duration.month = Math.floor(remaining / MONTH_SECONDS)
    remaining -= duration.month * MONTH_SECONDS
  }
  if (remaining % DAYS_SECONDS < remaining) {
    duration.day = Math.floor(remaining / DAYS_SECONDS)
    remaining -= duration.day * DAYS_SECONDS
  }
  if (remaining % HOUR_SECONDS < remaining) {
    duration.hour = Math.floor(remaining / HOUR_SECONDS)
    remaining -= duration.hour * HOUR_SECONDS
  }
  if (remaining % MINUTE_SECONDS < remaining) {
    duration.minute = Math.floor(remaining / MINUTE_SECONDS)
    remaining -= duration.minute * MINUTE_SECONDS
  }
  if (remaining) {
    duration.second = remaining
  }
  return duration
}

function plural(num, str) {
  return str + (num > 1 ? 's' : '')
}

function durationToString() {
  let str = ['year', 'month', 'week', 'day']
    .filter((key) => !!this[key])
    .map(key => `${this[key]} ${plural(this[key], key)}, `)
    .join('')

  str += ['hour', 'minute', 'second']
    .map((key) => this[key].toString().padStart(2, '0'))
    .join(':')
    .replace(/^0/, '') // remove leading zero
  return str
}
