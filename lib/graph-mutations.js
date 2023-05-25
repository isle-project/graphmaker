const deepCopy = require( '@stdlib/utils-copy' );
const isObject = require( '@stdlib/assert-is-plain-object' );
const isArray = require( '@stdlib/assert-is-array' );
const debug = require( 'debug' )( 'graphmaker:graph-mutations' );

const UNIQUE = 'u00z23823724823723823y23823x';

/**
 * Drops all $ref properties from a JSON object when stringified.
 */
function jsonRefReplacer( key, value ) {
    if ( key === '$ref' ) {
        return void 0;
    }
    if ( key === UNIQUE + 'default' ) {
        return void 0;
    }
    return value;
}

/* This mutates; do a deep copy before use */
function noQuoteKeysStringify( graph ) {
    const renamed = renameKeys( graph, key => UNIQUE + key );
    const out = `${JSON.stringify( renamed, jsonRefReplacer )
        .replace( new RegExp( '"' + UNIQUE + '(.*?)"', 'g' ), '$1' )}`;
    return out;
}

// ATTN:DOC this is mutating! need to pass a deep copy
function renameKeys( object, transformer ) {
    if ( isArray( object ) ) {
        return object.map( elt => renameKeys( elt, transformer ) );
    }
    if ( isObject( object ) ) {
        const myKeys = Object.keys( object );
        for ( const key of myKeys ) {
            const value = object[key];
            delete object[key];
            const newKey = key.startsWith('$') ? key : transformer( key );
            if ( isObject( value ) || isArray( value ) ) {
                object[newKey] = renameKeys( value, transformer );
            } else {
                object[newKey] = value;
            }
        }
    }
    return object;
}

function stringifyGraphForModel( inputGraph ) {
    const graph = deepCopy( inputGraph );
    delete graph._positions;
    return noQuoteKeysStringify( graph );
}

function fixGraph( inputGraph ) {
    const graph = deepCopy( inputGraph );
    let { adjacency, edges, nodes, constraints } = graph;

    debug( 'graph to be fixed: ', graph );
    // Normalize the Adjacency List so that each distinct edge appears only once
    // and that edge's data appears in the list associated with the *source* node only.
    const newAdjacency = {};
    const allEdges = {};  // maps edge name to an array of edge data objects

    Object.keys(adjacency).forEach((node) => {
        adjacency[node].forEach( edgeData => {
            if ( allEdges[edgeData.edge] ) {
                allEdges[edgeData.edge] = { ...allEdges[edgeData.edge], ...edgeData };
            } else {
                if ( !edgeData.sourceNode ) {
                    edgeData.sourceNode = node;  // If source node is missing and target is node, it's a self loop.
                }
                if ( !edgeData.targetNode ) {
                    edgeData.targetNode = node;
                }
                allEdges[edgeData.edge] = edgeData;
            }
        });
    });
    Object.keys(allEdges).forEach( edgeName => {
        const edgeData = allEdges[edgeName];
        if ( newAdjacency[edgeData.sourceNode] ) {
            newAdjacency[edgeData.sourceNode].push( edgeData );
        } else {
            newAdjacency[edgeData.sourceNode] = [edgeData];
        }
    });
    adjacency = graph.adjacency = newAdjacency;

    // Make sure all nodes in the adjacency list are represented in the nodes object:
    Object.keys(adjacency).forEach((node) => {
        adjacency[node].forEach((item) => {
            const targetNode = item.targetNode;
            if ( !Object.prototype.hasOwnProperty.call( nodes, targetNode ) ) {
                nodes[targetNode] = {}; // Add the missing node with an empty object
            }
        });
        if ( !Object.prototype.hasOwnProperty.call( nodes, node ) ) {
            nodes[node] = {};
        }
    });

    // Make sure all nodes in the nodes object are represented in the adjacency list:
    Object.keys(nodes).forEach(( key ) => {
        // Check whether node is represented in adjacency list, if not add it:
        if ( !Object.prototype.hasOwnProperty.call( adjacency, key ) ) {
            adjacency[key] = [];
        }
    });

    // Ensure that all edges mentioned in adjacency are in the edges object:
    Object.keys(adjacency).forEach((node) => {
        adjacency[node].forEach((item) => {
            if ( !item.targetNode ) {
                return;
            }
            const edgeName = item.edge || `${node}${item.targetNode}`;
            if ( !Object.prototype.hasOwnProperty.call( edges, edgeName) ) {
                edges[edgeName] = {}; // Add the missing edge with an empty object
            }
        });
    });

    for ( let conIndex = 0; constraints && conIndex < constraints.length; ++conIndex ) {
        const newCons = [];
        for ( const elem of constraints[conIndex].constraints ) {
            if ( /(?<![<>])=/.test( elem ) ) {
                const sides = elem.split( /(?<![<>])=/ );
                for ( let i = 0; i < sides.length - 1; ++i ) {
                    newCons.push( `${sides[i]} = ${sides[i+1]}`.trim() );
                }
            } else {
                newCons.push( elem );
            }
        }
        constraints[conIndex].constraints = newCons;
    }
    return graph;
}

function populateGraph( inputGraph, resetPositions = false ) {
    const graph = fixGraph( inputGraph );
    const { decorations, edges, nodes, styles = {} } = graph;
    Object.keys(nodes).forEach(( key ) => {
        const node = nodes[key];
        if ( node.style ) {
            nodes[key] = {
                ...styles[node.style],
                ...node
            };
        }
    });
    if ( decorations ) {
        Object.keys(decorations).forEach((decoration) => {
            if ( decorations[decoration].style ) {
                decorations[decoration] = {
                    ...styles[decorations[decoration].style],
                    ...decorations[decoration]
                };
            }
        });
    }
    Object.keys(edges).forEach((edge) => {
        if ( edges[edge].style ) {
            edges[edge] = {
                ...styles[edges[edge].style],
                ...edges[edge]
            };
        }
    });
    if ( resetPositions ) {
        delete graph._positions;
    }
    return graph;
}

module.exports = {
    stringifyGraphForModel,
    populateGraph,
    fixGraph,
    noQuoteKeysStringify
};
