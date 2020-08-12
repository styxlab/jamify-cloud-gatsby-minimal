module.exports = {
  siteMetadata: {
    title: `Gatsby Starter Blog`,
    author: {
      name: `Joost Jansky`,
      summary: `who lives and works in San Francisco building useful things.`,
    },
    description: `A starter blog demonstrating what Gatsby can do.`,
    siteUrl: `https://reverent-feynman-270efd.netlify.app/`,
    social: {
      twitter: `jamifyjs`,
    },
  },
  plugins: [
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        path: `${__dirname}/content/blog`,
        name: `blog`,
      },
    },
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        path: `${__dirname}/content/assets`,
        name: `assets`,
      },
    },
    {
      resolve: `jamify-source-ghost`,
      options: {
        ghostConfig: {
          apiUrl: `https://cms.gotsby.org`,
          contentApiKey: `387f956eaa95345f7bb484d0b8`,
        },
        // Use cache (optional, default: true)
        cacheResponse: true, 
        // Show info messages (optional, default: true)
        verbose: false,
        verbose: `info`,
      },
    },
    {
      resolve: require.resolve(`./plugins/gatsby-transformer-media-refs`),
      options: {
        lookup: [
          {
            nodeType: `GhostPost`,
            imageTags: [`feature_image`],
          },
        ],
        target: {
          path: `/static`,
        },
        failOnMissing: false,
        verbose: true,
      },
    },
    {
      resolve: `gatsby-transformer-remark`,
      options: {
        plugins: [
          {
            resolve: `gatsby-remark-images`,
            options: {
              maxWidth: 590,
            },
          },
          {
            resolve: `gatsby-remark-responsive-iframe`,
            options: {
              wrapperStyle: `margin-bottom: 1.0725rem`,
            },
          },
          `gatsby-remark-prismjs`,
          `gatsby-remark-copy-linked-files`,
          `gatsby-remark-smartypants`,
        ],
      },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-sharp`,
    `gatsby-plugin-react-helmet`,
    {
      resolve: `gatsby-plugin-typography`,
      options: {
        pathToConfigModule: `src/utils/typography`,
      },
    },
  ],
}
