const { isWebUri } = require(`valid-url`)
const Queue = require(`better-queue`)
const fileType = require(`file-type`)
const { createProgress } = require(`./utils`)

const fetch = require(`node-fetch`)
const crypto = require(`crypto`)
const sharp = require(`sharp`)
const mime = require(`mime`)

const { createMediaRefNode } = require(`./create-media-ref-node`)

const cacheIdForHeaders = url => `create-media-ref-node-headers-${url}`
const cacheIdForExtensions = url => `create-media-ref-node-extension-${url}`
const cacheIdForDigest = url => `create-media-ref-node-digest-${url}`

let bar
// Keep track of the total number of jobs we push in the queue
let totalJobs = 0

const STALL_RETRY_LIMIT = process.env.GATSBY_STALL_RETRY_LIMIT || 3
const STALL_TIMEOUT = process.env.GATSBY_STALL_TIMEOUT || 30000

const CONNECTION_TIMEOUT = process.env.GATSBY_CONNECTION_TIMEOUT || 30000

/********************
 * Queue Management *
 ********************/

/**
 * Queue
 * Use the task's url as the id
 * When pushing a task with a similar id, prefer the original task
 * as it's already in the processing cache
 */
const queue = new Queue(pushToQueue, {
  id: `url`,
  merge: (old, _, cb) => cb(old),
  concurrent: process.env.GATSBY_CONCURRENT_DOWNLOAD || 200,
})

// when the queue is empty we stop the progressbar
queue.on(`drain`, () => {
  if (bar) {
    bar.done()
  }
  totalJobs = 0
})

async function pushToQueue(task, cb) {
  try {
    const node = await processRemoteNode(task)
    return cb(null, node)
  } catch (e) {
    return cb(e)
  }
}

/******************
 * Core Functions *
 ******************/

const requestRemote = async (url, headers, httpOpts) => {

  const responseStream = await fetch(url, { 
    headers,
     ...httpOpts,
  })

  const buffer = await responseStream.buffer()
  return ({ 
    status: responseStream.status,
    responseHeaders: responseStream.headers,
    buffer,
  })
}

async function processRemoteNode({
  url,
  target = {},
  failOnMissing,
  cache,
  createNode,
  parentNodeId,
  auth = {},
  httpHeaders = {},
  createNodeId,
  ext,
}) {
  // See if there's response headers for this url
  // from a previous request.
  const cachedHeaders = await cache.get(cacheIdForHeaders(url))

  const headers = { ...httpHeaders }
  if (cachedHeaders && cachedHeaders.etag) {
    headers[`If-None-Match`] = cachedHeaders.etag
  }

  // Add htaccess authentication if passed in. This isn't particularly
  // extensible. We should define a proper API that we validate.
  const httpOpts = {}
  if (auth && (auth.htaccess_pass || auth.htaccess_user)) {
    httpOpts.auth = `${auth.htaccess_user}:${auth.htaccess_pass}`
  }

  // Fetch the remote data.
  const { status, reponseHeaders, buffer } = await requestRemote(url, headers, httpOpts)

  let digest
  if (status === 200) {
    await cache.set(cacheIdForHeaders(url), reponseHeaders)

    digest = crypto.createHash('sha1').update(buffer).digest('hex')
    await cache.set(cacheIdForDigest(url), digest)

    const filetype = fileType(buffer)
    if (filetype) {
      ext = `.${filetype.ext}`
      await cache.set(cacheIdForExtensions(url), ext)
    }

  } else if (status === 304) {
    // if file on server didn't change - grab cached extension
    ext = await cache.get(cacheIdForExtensions(url))
    digest = await cache.get(cacheIdForDigest(url))
  }

  // Create the image/media ref node.
  const mediaNode = await createMediaRefNode(url, createNodeId, {})

  // extension
  mediaNode.ext = ext || mediaNode.ext
  mediaNode.extension = ext.slice(1).toLowerCase()
  mediaNode.mediaType = mime.getType(ext)

  // internal
  mediaNode.internal.description = `Media Reference to ${url}`
  mediaNode.internal.type = `MediaRef`
  mediaNode.internal.contentDigest = digest
  mediaNode.parent = parentNodeId

  // Add image/media meta
  const meta = await sharp(buffer).metadata()
  const { format, width, height } = meta
  mediaNode.imageFormat = format
  mediaNode.imageWidth = width
  mediaNode.imageHeight = height
  
  const { host, path } = target
  const parsedURL = new URL( path || mediaNode.path, host || mediaNode.origin)
  const targetURL = (host && host.length > 0) ? parsedURL.toString() : parsedURL.pathname
  mediaNode.targetURL = `${targetURL}/${digest}/${mediaNode.name}${mediaNode.ext}`

  if (failOnMissing) {
    // TODO: AbortController, see https://github.com/whatwg/fetch/issues/951
    await requestRemote(mediaNode.targetURL, headers, httpOpts)
  }

  // Override the default plugin as gatsby-source-filesystem needs to
  // be the owner of File nodes or there'll be conflicts if any other
  // File nodes are created through normal usages of
  // gatsby-source-filesystem.
  await createNode(mediaNode, { name: `gatsby-transformer-media-ref` })
  return mediaNode
}

/**
 * Index of promises resolving to File node from remote url
 */
const processingCache = {}
/**
 * pushTask
 * --
 * pushes a task in to the Queue and the processing cache
 *
 * Promisfy a task in queue
 * @param {CreateJamifymediaNodePayload} task
 * @return {Promise<Object>}
 */
const pushTask = task =>
  new Promise((resolve, reject) => {
    queue
      .push(task)
      .on(`finish`, task => {
        resolve(task)
      })
      .on(`failed`, err => {
        reject(`failed to process ${task.url}\n${err}`)
      })
  })

/***************
 * Entry Point *
 ***************/

export const createMediaRef = ({
  url,
  target = {},
  failOnMissing = false,
  cache,
  createNode,
  getCache,
  parentNodeId = null,
  auth = {},
  httpHeaders = {},
  createNodeId,
  ext = null,
  name = null,
  reporter,
}) => {
  // validation of the input
  // without this it's notoriously easy to pass in the wrong `createNodeId`
  // see gatsbyjs/gatsby#6643
  if (typeof createNodeId !== `function`) {
    throw new Error(`createNodeId must be a function, was ${typeof createNodeId}`)
  }
  if (typeof createNode !== `function`) {
    throw new Error(`createNode must be a function, was ${typeof createNode}`)
  }
  if (typeof getCache === `function`) {
    // use cache of this plugin and not cache of function caller
    cache = getCache(`gatsby-transformer-media-ref`)
  }
  if (typeof cache !== `object`) {
    throw new Error(
      `Neither "cache" or "getCache" was passed. getCache must be function that return Gatsby cache, "cache" must be the Gatsby cache, was ${typeof cache}`
    )
  }

  // Check if we already requested node for this remote image
  // and return stored promise if we did.
  if (processingCache[url]) {
    return processingCache[url]
  }

  if (!url || isWebUri(url) === undefined) {
    return Promise.reject(
      `url passed to CreateMediaRef is either missing or not a proper web uri: ${url}`
    )
  }

  if (totalJobs === 0) {
    bar = createProgress(`Inspecting remote media references `, reporter)
    bar.start()
  }

  totalJobs += 1
  bar.total = totalJobs

  const mediaRefPromise = pushTask({
    url,
    target,
    failOnMissing,
    cache,
    createNode,
    parentNodeId,
    createNodeId,
    auth,
    httpHeaders,
    ext,
    name,
  })

  processingCache[url] = mediaRefPromise.then(node => {
    bar.tick()

    return node
  })

  return processingCache[url]
}
