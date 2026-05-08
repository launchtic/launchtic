// Empty Craft.js canvas — used when creating a new FunnelStep
// Minimal structure: ROOT node containing a Page element
export const defaultPageJson = {
  ROOT: {
    type: { resolvedName: "Page" },
    isCanvas: true,
    props: {
      background: "rgba(255,255,255,1)",
    },
    displayName: "Page",
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
  },
};
