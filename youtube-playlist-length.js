// ==UserScript==
// @name        YouTube Playlist Duration
// @namespace   Violentmonkey Scripts
// @match       https://www.youtube.com/*
// @grant       GM_getValue
// @version     1.3.0
// @author      Rafael Botazini
// @homepageURL https://github.com/rafaelbotazini/user-scripts
// @downloadURL https://raw.githubusercontent.com/rafaelbotazini/user-scripts/main/youtube-playlist-length.js
// @description Shows the current playlist total length at the playlist description section
// 
// @require  http://ajax.googleapis.com/ajax/libs/jquery/1.8.3/jquery.min.js
// @require  https://gist.github.com/raw/2625891/waitForKeyElements.js
// ==/UserScript==

const API_KEY = GM_getValue('apiKey', '')
const LOG_ENABLED = GM_getValue('logEnabled', false)
const USE_LONG_DESCRIPTION = GM_getValue('useLongDescription', true)

if (!API_KEY) {
  console.warn("No apiKey value was detected. Check YouTube Playlist Duration script configuration.")
  return
}

// Since the pages are loaded dinamically via AJAX, we will listen for node changes to trigger the
// playlists information querying. So, in order to prevent unnecessary api calls when the node of an already
// loaded playlist changes, we will cache the current playlist path and id
let gCurrentPath = ''
let gCurrentPlaylist = ''

// wait for elements to be ready and observe changes
;[
  "ytd-playlist-panel-renderer:not([hidden])", // sidebar of playlist page (/playlist?list=abcd)
  "ytd-playlist-sidebar-primary-info-renderer:not([hidden])" // sidebar of watch page for videos within a playlist (/watch?v=1234&list=abcd)
].forEach((selector) => waitForKeyElements(selector, function ($this) {
  // trigger on ready
  main()

  // trigger on changes
  const observer = new MutationObserver(main)
  const element = $this[0]
  observer.observe(element, { childList: true, subtree: true })
}))


function main() {
  const search = new URLSearchParams(window.location.search)
  const playlistId = search.get('list')

  // exit if not a playlist page
  if (!playlistId) return

  // exit if change was already detected
  if(playlistId === gCurrentPlaylist && gCurrentPath === window.location.pathname) return

  gCurrentPath = window.location.pathname
  gCurrentPlaylist = playlistId

  // create or use already created label
  let $duration = document.getElementById('yt-playlist-duration')

  if (!$duration) {
    $duration = document.createElement('yt-formatted-string')
    $duration.id = 'yt-playlist-duration'
  }

  $duration.innerHTML = '...'
  $duration.title = 'Fetching playlist duration...'

  const isPlaylistPage = window.location.pathname.startsWith('/playlist')

  let $container
  let $cssSource

  // change elements based on location
  if (isPlaylistPage) {
    $container = document.getElementById('stats')
    $cssSource = $container.firstElementChild
  } else {
    $container = document.querySelector('ytd-playlist-panel-renderer:not([hidden]) #publisher-container')
    $cssSource = $container.lastElementChild
  }
  
  // prevent removing css if already appended
  if ($duration !== $cssSource) {
    // remove all classes from target
    DOMTokenList.prototype.remove.apply($duration.classList, $duration.classList)
    // add classes from source
    DOMTokenList.prototype.add.apply($duration.classList, $cssSource.classList)
  }

  $container.appendChild($duration)
  
  getPlaylistDuration(playlistId)
    .then((result) => {
      if (!result) return

      const [duration, seconds] = result

      const at125 = parseDuration(Math.round(seconds / 1.25))
      const at150 = parseDuration(Math.round(seconds / 1.5))
      const at175 = parseDuration(Math.round(seconds / 1.75))
      const at200 = parseDuration(Math.round(seconds / 2))

      let title = `${at125} at 1.25x • ${at150} at 1.5x • ${at175} at 1.75x • ${at200} at 2x`
      let html = duration.toString()

      if (!isPlaylistPage) {
        html = '&nbsp;-&nbsp;' + html
      }

      $duration.innerHTML = html
      $duration.title = title
    })
    .catch((err) => {
      LOG_ENABLED && console.error(err)
      $duration.innerHTML = 'N/A'
      $duration.title = 'Playlist duration not available'
    })
}

async function getPlaylistDuration(playlistId) {
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

  LOG_ENABLED && console.log(`Total playlist duration: ${duration}`)

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
  if (USE_LONG_DESCRIPTION) {
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
