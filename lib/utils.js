function baseGraph() {
    return {
        directed: false,
        nodes: {},
        edges: {},
        adjacency: {},
        relations: {},
        constraints: [],
    };
}

module.exports = {
    baseGraph
};
