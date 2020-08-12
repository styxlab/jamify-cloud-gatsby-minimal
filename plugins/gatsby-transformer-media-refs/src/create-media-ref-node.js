const path = require(`path`)

exports.createMediaRefNode = async (
  url,
  createNodeId,
  pluginOptions = {}
) => {
  const { origin, pathname } = new URL(url)
  const { name, ext } = path.parse(pathname)

  const mediaRefData = {
    url,
    origin,
    path: pathname,
    name,
    ext,
  }

  // Stringify date objects.
  return JSON.parse(
    JSON.stringify({
      id: createNodeId(url),
      children: [],
      parent: null,
      internal: {},
      sourceInstanceName: pluginOptions.name || `__PROGRAMMATIC__`,
      ...mediaRefData,
    })
  )
}
