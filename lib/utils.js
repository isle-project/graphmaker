function baseGraph() {
    return {
        directed: false,
        nodes: {},
        edges: {},
        adjacency: {},
        constraints: []
    };
}

module.exports = {
    baseGraph
};
