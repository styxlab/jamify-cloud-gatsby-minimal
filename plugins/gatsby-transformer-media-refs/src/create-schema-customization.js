const typeDefs = `
  type MediaRef implements Node @infer {
    id: String
    url: String
    name: String
    ext: String
    extension: String
    mediaType: String
    origin: String
    path: String
    sourceInstanceName: String
    imageFormat: String
    imageHeight: Int
    imageWidth: Int
    targetURL: String
  }
`

const createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions
  createTypes(typeDefs)
}

module.exports = createSchemaCustomization