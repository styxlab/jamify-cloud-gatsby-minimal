"use strict";

const _ = require(`lodash`);

const {
  createMediaRef
} = require(`./create-media-ref`);

const pluginDefaults = {
  lookup: [],
  target: {},
  exclude: () => false,
  failOnMissing: false,
  verbose: false
};

exports.onCreateNode = async function ({
  node,
  actions,
  createNodeId,
  reporter,
  cache,
  store
}, pluginOptions) {
  const {
    createNode
  } = actions;

  const {
    lookup,
    target,
    exclude,
    failOnMissing,
    verbose
  } = _.merge({}, pluginDefaults, pluginOptions); // leave if node is excluded by user


  if (exclude(node)) {
    return {};
  }

  const lookupNodes = lookup.filter(item => item.nodeType === node.internal.type); // leave if node type does not match

  if (lookupNodes.length === 0) {
    return {};
  }

  const allImgTags = lookupNodes[0].imageTags.filter(item => node[item] !== null && node[item] !== undefined); // leave if image field is empty

  if (allImgTags.length === 0) {
    return {};
  } // remaining image fields


  const promises = allImgTags.map(async tag => {
    const imgUrl = node[tag].replace(/^\/\//, `https://`);

    if (verbose) {
      reporter.info(`${node.internal.type}/${tag}/${node.slug}/${imgUrl}`);
    }

    return await createMediaRef({
      url: imgUrl,
      parentNodeId: node.id,
      target,
      failOnMissing,
      createNode,
      createNodeId,
      cache,
      store
    });
  });
  let mediaNodes;

  try {
    mediaNodes = await Promise.all(promises);
  } catch (err) {
    reporter.panicOnBuild(`Error processing images ${node.url ? `image ref ${node.url}` : `in node ${node.id}`}:\n ${err}`);
    return {};
  } // foreign-key linking
  // https://www.gatsbyjs.com/docs/schema-gql-type#foreign-key-reference-___node


  mediaNodes.map((mediaNode, i) => {
    const id = `${_.camelCase(`${allImgTags[i]}MediaRef`)}`;
    node[`${id}___NODE`] = mediaNode.id;
  });
  return {};
};