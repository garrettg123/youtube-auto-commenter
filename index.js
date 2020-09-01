/**
 * YOUTUBE AUTO-COMMENTER
 *
 * Ideally, this script will find relevant videos and comment on them.
 * It will also avoid commenting on videos that have already been commented on.
 *
 * To use it, you will need to make an API key for Google Cloud and retrieve
 * an auth token for your Youtube account.
 *
 * Additionally, there is a quota for the number of requests you can make:
 * https://developers.google.com/youtube/v3/determine_quota_cost
 *
 * Breakdown of Quota:
 * - search can return up to 50 videos, so only one search per 50 comments is necessary
 *
 * Variables:
 * searchCount / 50 = commentThreadsListCount = commentThreadsInsertCount = x
 *
 * Formula:
 * SEARCH_COST + COMMENTTHREADS_LIST_COST + COMMENTTHREADS_INSERT_COST <= COST_QUOTA
 * searchCount / 50 * 100 + commentThreadsListCount * 1 + commentThreadsInsertCount * 50 = 10000
 * 100x + x + 50x = 10000
 * 151x = 10000
 * x = 66
 *
 * Conclusion:
 * 66 comments can be made per day programmatically for the quota.
 */

import _ from 'lodash'
import axios from 'axios'

/**
 * CONFIGURATION START
 */

/**
 * The number of searches to make.
 */
const MAX_SEARCH_COUNT = 20

/**
 * How to get auth token (probably a better way to do this):
 * 1. Press "execute" on https://developers.google.com/youtube/v3/docs/commentThreads/insert?apix=true&apix_params=%7B%22resource%22%3A%7B%7D%7D
 * 2. Open the inspector and go to the network tab
 * 3. Press "execute" again and see what the auth token is in the request
 */
const AUTH_TOKEN = ''

/**
 * Create/use the api key generated here:
 * https://console.cloud.google.com/apis/credentials
 */
const API_KEY = ''

// Search terms for videos to comment on
const searchTerms = [
  'these are',
  'search',
  'terms that will',
  'be used on youtube',
  'to find relevant videos',
]

/** A term that is always present in your comments
 * Used to see if you already commented on the video
 */
const EXISTING_COMMENT_SEARCH_TERM = 'myapp'

/**
 * Customize to generate a random comment.
 * Too many duplicate comments will trigger a ban.
 */
function getCommentText() {
  let text = `${_.sample([
    'Thanks for sharing!',
    'Thanks for the video!',
    'Great video!',
    'Love this!',
    'Thank you!!',
    'This is great!',
    'Really love this!',
    'Thanks for the helpful information!',
  ])} What helps me is this awesome app I built: ${EXISTING_COMMENT_SEARCH_TERM}.com. Please edit this, it sounds very spammy.`

  return text
}

/**
 * CONFIG END
 */

new Promise(async (resolve, reject) => {
  const videoIds = []
  let searchCount = 0
  let pageToken

  let q = searchTerms.shift()
  console.log('Finding videos for query %s', q)

  while (searchCount < MAX_SEARCH_COUNT) {
    console.log(
      'Running search query #%s for video #%s',
      searchCount,
      videoIds.length
    )
    let url = `https://www.googleapis.com/youtube/v3/search?q=${q}&order=date&key=${API_KEY}&maxResults=50`
    if (pageToken) {
      url += `&pageToken=${pageToken}`
    }

    let result
    try {
      result = await axios.get(url)
    } catch (err) {
      console.log('Error finding video for %s', q)
      console.error(err?.response?.data)
      break
    }

    const { data } = result
    pageToken = data.nextPageToken
    data.items.forEach(
      item => item.id.videoId && videoIds.push(item.id.videoId)
    )

    if (data.items.length < 50) {
      if (searchTerms.length) {
        q = searchTerms.shift()
        console.log('Using next search term %s', q)
      } else {
        console.log('Finished finding videos for query %s', q)
        break
      }
    }

    searchCount++
  }

  console.log('Finished finding %s videos', videoIds.length)
  // videoIds.forEach(videoId =>
  //   console.log('https://www.youtube.com/watch?v=' + videoId)
  // )

  const newVideoIds = []
  for (let videoId of videoIds) {
    console.log('Checking for existing comment on video %s', videoId)
    const doesVideoHaveComment = await hasComment({ videoId })
    if (doesVideoHaveComment) {
      console.log('Video %s already has comment - skipping', videoId)
      continue
    }

    newVideoIds.push(videoId)
    await postComment({ videoId })

    // process.exit(0)
  }

  console.log(
    'Finished filtering %s videos into %s',
    videoIds.length,
    newVideoIds.length
  )
  newVideoIds.forEach(videoId =>
    console.log('https://www.youtube.com/watch?v=' + videoId)
  )
})

async function hasComment({ videoId }) {
  let result

  try {
    result = await axios.get(
      `https://www.googleapis.com/youtube/v3/commentThreads?key=${API_KEY}&searchTerms=${EXISTING_COMMENT_SEARCH_TERM}&videoId=${videoId}&maxResults=1`
    )
  } catch (err) {
    // Not allowed comments on video
    if (err?.response?.status === 403) {
      console.log('Video %s doesn’t allow comments', videoId)
      return true
    }

    console.error(
      'Error getting comment threads for video %s',
      videoId,
      err?.response?.data
    )
    return false
  }

  // console.log(result.data)
  return result.data.pageInfo.totalResults > 0
}

async function postComment({ videoId }) {
  let result

  console.log('Posting comment to video %s', videoId)
  try {
    result = await axios.post(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet`,
      {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: {
              textOriginal: getCommentText(),
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      }
    )
  } catch (err) {
    console.error('Error posting comment threads for video %s', videoId)
    console.dir(err?.response?.data, { depth: null })
    return
  }

  const waitTime = 3000 + Math.random() * 60000
  console.log(
    'Waiting %ss after posting comment to %s',
    waitTime / 1000,
    videoId
  )
  await new Promise(resolve => setTimeout(() => resolve(), waitTime))
}
