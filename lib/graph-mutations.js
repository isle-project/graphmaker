const hasOwnProp = require( '@stdlib/assert-has-own-property' );
const deepCopy = require( '@stdlib/utils-copy' );
const isObject = require( '@stdlib/assert-is-plain-object' );
const isArray = require( '@stdlib/assert-is-array' );
const omitBy = require( '@stdlib/utils/omit-by' );
const merge = require( '@stdlib/utils-merge' );
const debug = require( 'debug' )( 'graphmaker:graph-mutations' );
const graphSchema = require( './spec/graph-schema.json' );

const { ValidationError, baseGraph, deepSet } = require( './utils.js' );

const UNIQUE = 'u00z23823724823723823y23823x';

/**
 * This utility function removes all $ref properties from an object during `JSON.stringify`.
 *
 * @param {string} key - the name of the object key
 * @param {*} value - the value associated with the key
 * @returns {*} returns the value if key doesn't match '$ref' or 'UNIQUE + default', undefined otherwise
 */
function jsonRefReplacer( key, value ) {
    if ( key === '$ref' ) {
        return void 0;
    }
    if ( key === UNIQUE + 'default' ) {
        return void 0;
    }
    if ( key === UNIQUE + 'description' && typeof value === 'object' ) {
        return value[UNIQUE+'model'];
    }
    return value;
}

/**
 * Stringify an object without quotes on keys. It's mutating so it needs a deep copy of the object before use.
 *
 * @param {Object} graph - object to be stringified
 * @returns {string} JSON string representation of the input object
 */
function noQuoteKeysStringify( graph ) {
    const renamed = renameKeys( graph, key => UNIQUE + key );
    const out = `${JSON.stringify( renamed, jsonRefReplacer )
        .replace( new RegExp( '"' + UNIQUE + '(.*?)"', 'g' ), '$1' )}`;
    return out;
}

/**
 * Renames the keys of an object or an array using a provided transformer function.
 * This function mutates the original object, so a deep copy is required before use.
 *
 * @param {Object|Array} object - object or array to rename keys
 * @param {Function} transformer - function that takes a key and returns a new key
 * @returns {Object|Array} the input object/array with renamed keys
 */
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

/**
 * Convert a graph into a string that is compatible with the model.
 * This will first make a deep copy of the graph and then remove _positions and _adjacency before stringifying it.
 *
 * @param {Object} inputGraph - original graph to convert
 * @returns {string} a string representation of the graph compatible with the model
 */
function stringifyGraphForModel( inputGraph ) {
    const graph = deepCopy( inputGraph );
    delete graph._positions;
    delete graph._adjacency;
    return noQuoteKeysStringify( graph );
}

/**
 * Builds an adjacency list for the given graph that satisfies a key invariant.
 *
 * @param {Object} graph.edges - object mapping edge names to properties and styles
 * @param {Object} graph.nodes - object mapping node names to properties and styles,
 *    but only the object's keys are used herein.
 * @returns {Object} an adjacency list representation of the graph that satisfies
 *     the key invariant described below. This guarantees that every node in the
 *     the graph is represented, even if by an empty list.
 *
 * Key Invariant: Each edge appears exactly once in the returned adjacency list.
 *     Moreover, the edge is included in a position that ensures it reflects
 *     the direction from putative source to target.
 */
function buildAdjacency( { edges, nodes } ) {
    const adjacency = {};
    const edgeNames = Object.keys( edges );
    edgeNames.forEach( edgeName => {
        const source = edges[edgeName].source;
        if ( !adjacency[source] ) {
            adjacency[source] = [];
        }
        adjacency[source].push( edgeName );
    });
    Object.keys( nodes ).forEach( node => {
        if ( !adjacency[node] ) {
            adjacency[node] = [];  // Ensure that each node is represented
        }
    });
    return adjacency;
}

/**
 * Sanitizes a graph by applying the changes from a diff string and validating the result.
 *
 * @param {string} diffStr - the diff string of changes to be applied
 * @param {Object} graph - the graph to be updated
 * @param {Object} validator - the AJV JSON schema validator to be used to validate the updated graph; assumed to have a `validate` method
 * @param {Function} repair - the JSON repair function to be used to repair the diff string if it is invalid
 * @returns {Object} the updated graph
 */
function sanitizeGraph( diffStr, graph, validator, repair ) {
    let changes;
    try {
        changes = JSON.parse( diffStr );
    } catch ( parseError ) {
        try {
            changes = JSON.parse( repair( diffStr ));
        } catch ( repairError ) {
            throw parseError;
        }
    }
    debug( '\n------- In Sanitize Graph' );
    debug( 'Changes:' );
    debug( JSON.stringify( changes ) );
    const newGraph = fixGraph( assembleGraphFromDiff( graph, changes ) );
    debug( 'newGraph:' );
    debug( JSON.stringify( newGraph ) );
    debug( '-------\n' );
    const isValid = validator.validate( graphSchema, newGraph );
    if ( !isValid ) {
        throw new ValidationError( 'Invalid graph', validator.errors, newGraph );
    }
    return newGraph;
}

/**
 * Ensure all nodes and edges are properly defined in the input graph.
 *
 * @param {Object} inputGraph - original graph to fix
 * @returns {Object} fixed graph
 */
function fixGraph( inputGraph ) {
    const graph = deepCopy( inputGraph );
    let { edges, nodes, constraints } = graph;

    debug( 'graph to be fixed: ', graph );

    // Ensure that every node referenced in edges is in the nodes object:
    Object.keys( edges ).forEach( edgeName => {
        const edge = edges[edgeName];
        const source = edge.source;
        const target = edge.target;
        if ( !nodes[source] ) {
            nodes[source] = {};
        }
        if ( !nodes[target] ) {
            nodes[target] = {};
        }
    });

    // Convert multiple equalities relations (e.g., A = B = C) into distinct constraints
    for ( let conIndex = 0; constraints && conIndex < constraints.length; ++conIndex ) {
        const newCons = [];
        for ( let elem of constraints[conIndex].constraints ) {
            elem = elem.replace( ' < ', ' <= ' );
            elem = elem.replace( ' > ', ' >= ' );
            elem = elem.replace( /\s+/g, ' ' );
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
 * Create a style object that combines one or more named styles.
 * The styles are merged with precedence given to those later in the list.
 *
 * @param {Array<String>|String>} styleNames - either a style name or a list of style names
 * @param {Object} styles - a mapping from style names to user-defined style objects
 * @return {Object} a style object that combines the named styles, merging in the order given (last takes precedence).
 */
function mergeStyles( styleNames, styles ) {
    if ( isArray( styleNames ) ) {
        return merge( {}, ...styleNames.map( style => styles[style] || {}) );
    }
    return styles[styleNames] || {}; // `styleNames` is a single string
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
        if ( nodes[key].style ) {
            nodes[key] = {
                ...mergeStyles( nodes[key].style, styles ),
                ...nodes[key]
            };
            debug( `nodes[${key}]: `, nodes[key] );
            debug( 'styles: ', styles );
        }
    });
    if ( decorations ) {
        Object.keys(decorations).forEach((decoration) => {
            if ( decorations[decoration].style ) {
                decorations[decoration] = {
                    ...mergeStyles( decorations[decoration].style, styles ),
                    ...decorations[decoration]
                };
            }
        });
    }
    Object.keys(edges).forEach((edge) => {
        if ( edges[edge].style ) {
            edges[edge] = {
                ...mergeStyles( edges[edge].style, styles),
                ...edges[edge]
            };
        }
    });
}

/**
 * Prepare a graph for processing. It fixes the graph, inserts styles, builds the adjacency list, and optionally resets positions.
 *
 * @param {Object} inputGraph - the original graph to populate
 * @param {boolean} resetPositions - indicates whether to reset positions in the graph
 * @returns {Object} the populated graph
 */
function populateGraph( inputGraph, resetPositions = false ) {
    const graph = fixGraph( inputGraph );
    insertStyles( graph );
    graph._adjacency = buildAdjacency({ edges: graph.edges, nodes: graph.nodes });
    if ( resetPositions ) {
        delete graph._positions;
    }
    return graph;
}

/**
 * Corrects for AI models (mistaken) tendency to include extraneous null values in diffs.
 * This removes any keys from a diff value object whose associated value is null.
 *
 * @param {any} change - the value associated with a particular diff key
 * @returns {any} if `change` is an object, return the object with keys omitted that
 *     are associated with null values; otherwise, return `change` itself.
 */
function repairDiff( change ) {
    return isObject( change ) ? omitBy( change, (_, val ) => val === null ) : change;
}

/**
 * Assembles a graph object by applying the changes from a diff object to a graph.
 *
 * @param {Object} graph - the graph to be updated
 * @param {Object} changes - the changes to be applied
 * @returns {Object} the updated graph
 */
function assembleGraphFromDiff( graph, changes ) {
    const outGraph = deepCopy( graph );
    const base = baseGraph();
    for ( const key in changes ) {
        if ( hasOwnProp( changes, key ) ) {
            const props = key.split( '.' );
            if ( props.includes( '' ) ) {
                throw new ValidationError( 'Invalid property path.', changes, key );
            }
            deepSet(
                outGraph,
                props,
                true,
                true,
                (changes[ key ] === null) ? (base[key] !== void 0  ? base[key] : void 0) : repairDiff( changes[ key ] )
            );
        }
    }
    return outGraph;
}

module.exports = {
    buildAdjacency,
    insertStyles,
    mergeStyles,
    stringifyGraphForModel,
    populateGraph,
    fixGraph,
    sanitizeGraph,
    noQuoteKeysStringify,
    assembleGraphFromDiff
};
