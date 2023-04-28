function baseGraph() {
    return {
        directed: false,
        hasParents: false,
        categories: [],
        nodes: {},
        edges: {},
        adjacency: {},
        constraints: []
    };
}

module.exports = {
    baseGraph
};
