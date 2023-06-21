const hasOwnProperty = require( '@stdlib/assert/has-own-property' );
const { buildAdjacency } = require('./graph-mutations.js');

/**
 * Generates a text summary of a graph or a graph component.
 *
 * @param {string} format - one of 'summary', 'nodes', 'edges', 'decorations', or 'constraints'
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarize( format, graph ) {
    switch ( format.toLowerCase() ) {
        case 'summary':
            return summarizeGraph( graph );
        case 'nodes':
            return summarizeNodes( graph );
        case 'edges':
            return summarizeEdges( graph );
        case 'decorations':
            return summarizeDecorations( graph );
        case 'constraints':
            return summarizeConstraints( graph );
        default:
            throw new Error( 'Invalid summary format' );
    }
}

/**
 * Generates a text summary of a graph's nodes and edges.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeGraph( graph ) {
    const nodeNames = Object.keys(graph.nodes);
    const adjacency = buildAdjacency( graph );  // Each edge appears only once here
    const out = [];
    let icon;
    const adjList = {};
    if ( graph.directed ) {
        icon = '->';
        for ( const node of nodeNames ) {
            adjList[node] = adjacency[node].map( edgeName => graph.edges[edgeName].target );
        }
    } else {
        icon = '--';
        for ( const node of nodeNames ) {
            adjList[node] = [];
        }
        // Symmetrize the adjacency list
        for ( const node of nodeNames ) {
            adjacency[node].forEach( edgeName => adjList[node].push(graph.edges[edgeName].target ) );
            for ( const edge of adjacency[node] ) {
                if ( graph.edges[edge].target !== node ) {
                    adjList[graph.edges[edge].target].push( node );
                }
            }
        }
    }
    for ( const node of nodeNames ) {
        const edges = adjList[node];
        out.push( `${node} ${icon} ${edges.join(', ')}`);
    }
    out.push( `This graph is ${graph.directed ? 'directed' : 'undirected'}.` );
    return out.join('\n');
}

/**
 * Summarizes the nodes in a graph and their properties.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeNodes(graph) {
    const propertiesMap = {
        'label': 'label',
        'nodeSize': 'size',
        'fillColor': 'color',
        'style': 'styles'
    };
    let out = '';
    for (const nodeName in graph.nodes) {
        if ( hasOwnProperty(graph.nodes, nodeName) ) {
            const node = graph.nodes[nodeName];
            const nodeDetails = [];
            for (let property in propertiesMap) {
                if (node[property]) {
                    let propertyValue = node[property];
                    if (property === 'style' && Array.isArray(propertyValue)) {
                        propertyValue = '(' + propertyValue.join(',') + ')';
                    }
                    nodeDetails.push(` ${propertiesMap[property]} "${propertyValue}"`);
                }
            }
            out += nodeName + ':';
            out += nodeDetails.join(',');
            out += '\n';
        }
    }
    return out;
}

/**
 * Summarizes the edges in a graph and their properties.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeEdges(graph) {
    const propertiesMap = {
        'source': 'source',
        'target': 'target',
        'label': 'label',
        'weight': 'weight',
        'style': 'styles'
    };

    let out = '';
    for ( const edgeName in graph.edges ) {
        if ( hasOwnProperty( graph.edges, edgeName) ) {
            const edge = graph.edges[edgeName];
            const edgeDetails = [];
            for ( const property in propertiesMap ) {
                if ( edge[property] ) {
                    let propertyValue = edge[property];
                    if (property === 'style' && Array.isArray(propertyValue)) {
                        propertyValue = '(' + propertyValue.join(',') + ')';
                    }
                    edgeDetails.push(` ${propertiesMap[property]} "${propertyValue}"`);
                }
            }
            out += edgeName + ':';
            out += edgeDetails.join(',');
            out += '\n';
        }
    }
    return out;
}

/**
 * Summarizes the decorations in a graph.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeDecorations( graph ) {
    // TODO: list decorations and their meanings(?)
}

/**
 * Summarizes the constraints in a graph.
 *
 * @param {Object} graph - graph object
 * @returns {string} summary text
 */
function summarizeConstraints( graph ) {
    // TODO: List string constraints and their meanings(?)
}

module.exports = {
    summarize,
    summarizeGraph,
    summarizeNodes,
    summarizeEdges,
    summarizeDecorations,
    summarizeConstraints
};
