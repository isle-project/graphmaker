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
    delete graph._adjacency;
    return noQuoteKeysStringify( graph );
}

/**
 *
 * Invariant: Adjacency only includes the direction from putative source to target
 */
function buildAdjacency( edges ) {
    const adjacency = {};
    const edgeNames = Object.keys( edges );
    edgeNames.forEach( edgeName => {
        const sourceNode = edges[edgeName].sourceNode;
        if ( !adjacency[sourceNode] ) {
            adjacency[sourceNode] = [];
        }
        adjacency[sourceNode].push( edgeName );
    });
    return adjacency;
}

function fixGraph( inputGraph ) {
    const graph = deepCopy( inputGraph );
    let { edges, nodes, constraints } = graph;

    debug( 'graph to be fixed: ', graph );

    // Ensure that every node referenced in edges is in the nodes object:
    Object.keys( edges ).forEach( edgeName => {
        const edge = edges[edgeName];
        const sourceNode = edge.sourceNode;
        const targetNode = edge.targetNode;
        if ( !nodes[sourceNode] ) {
            nodes[sourceNode] = {};
        }
        if ( !nodes[targetNode] ) {
            nodes[targetNode] = {};
        }
    });

    // Convert multiple equalities relations (e.g., A = B = C) into distinct constraints
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

/**
 * Inserts style properties into the nodes, edges, and decorations of a graph.
 * This mutates the input.
 *
 * @param {Object} graph - the graph to be mutated
 */
function insertStyles( graph ) {
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
}

function populateGraph( inputGraph, resetPositions = false ) {
    const graph = fixGraph( inputGraph );
    insertStyles( graph );
    graph._adjacency = buildAdjacency( graph.edges );
    if ( resetPositions ) {
        delete graph._positions;
    }
    return graph;
}

module.exports = {
    buildAdjacency,
    stringifyGraphForModel,
    populateGraph,
    fixGraph,
    noQuoteKeysStringify
};
