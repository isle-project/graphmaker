const deepCopy = require( '@stdlib/utils-copy' );
const isObject = require( '@stdlib/assert-is-plain-object' );
const isArray = require( '@stdlib/assert-is-array' );

const UNIQUE = 'u00z23823724823723823y23823x';

/**
 * Drops all $ref properties from a JSON object when stringified.
 */
function jsonRefReplacer( key, value ) {
    if ( key === '$ref' ) {
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
    const { adjacency, edges, nodes, constraints } = graph;

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
            const edgeName = item.edge;
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

function populateGraph( inputGraph ) {
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
    console.log( 'POPULATED GRAPH', graph );
    return graph;
}

module.exports = {
    stringifyGraphForModel,
    populateGraph,
    fixGraph,
    noQuoteKeysStringify
};
