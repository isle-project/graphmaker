const debug = require( 'debug' )( 'graphmaker:constraints' );
const deepCopy = require( '@stdlib/utils-copy' );
const hasOwnProp = require( '@stdlib/assert-has-own-property' );
const nearley = require('nearley');

const grammar = nearley.Grammar.fromCompiled( require('./constraint-grammar.js') );

// Constants

const UNCONSTRAINED = { matrix: [], rhs: [] };
const ANCHORS = require('./spec/anchors.json');


// Base Parser

/**
 * Parses a single constraint string into a descriptive object.
 *
 * @param {string} constraint - constraint string
 * @param {boolean} all - whether to return all possible parses (default: false)
 * @returns {Object|undefined} parsed constraint object or undefined if no parse
 */
const parseConstraint = (constraint, all = false) => {
    // Create a Parser object from our grammar.
    const parser = new nearley.Parser(grammar);

    parser.feed( constraint );

    if ( all ) {
        return parser.results;
    }
    return parser.results?.[0];
};

// Constraint Anchors

/**
 * Computes effective coefficient for x and y position and RHS adjustment.
 *
 * @param {?Object,<string, [number,number]>} coefs -
 *     mapping from anchor names to pairs of coefficients corresponding to
 *     the x and y directions
 * @param {number} scale - a scaling parameter from node units to constraint units
 * @param {number} size - the node's size
 * @param {number} widthToHeight - the node's width-to-height ratio (in same units as size)
 *
 * @returns {{xCoef: number, yCoef: number, rhsAdjust: number}} the coefficients of the node's
 *     x and y coordinates in the constraint and the right-hand-side adjustment
 *     to be added to the parsed right-hand-side value for the constraint.
 */
function anchoredTerms( coefs, { scale, size = 1, widthToHeight = 1 } ) {
    let xCoef = 0;
    let yCoef = 0;
    let rhsAdjust = 0;

    if ( coefs ) {
        for ( const anchor in coefs ) {
            if ( hasOwnProp( coefs, anchor ) ) {
                const [dx, dy] = ANCHORS[anchor];
                xCoef += coefs[anchor][0];
                yCoef += coefs[anchor][1];
                rhsAdjust += size * scale * (widthToHeight * dx * xCoef + dy * yCoef);
            }
        }
        rhsAdjust *= -1;  // The coefficient terms are on LHS.
    }

    return { xCoef, yCoef, rhsAdjust };
}


// Entry Point

/**
 * Converts a list of constraint string into constraint matrices and vectors.
 *
 * @param {Array<string>} constraints - list of constraints specified as strings
 *     according to the constraint grammar (@see{@link `constraint-grammar.ne`}).
 * @param {Array<string>} nodesInOrder - list of node names in the order to be
 *     used in the constraint matrices. This ordering should be consistent throughout.
 * @returns {Object} - {equality, leq} representing equality and inequality constraints,
 *     where each is in turn an object with .matrix and .rhs props specifying the
 *     constraints uniquely.
 */
const convertConstraints = (constraints, nodesInOrder, nodes, scale) => {
    // ATTN: will need nodes to get sizes and baseSize to compute with .n|e|w|...
    // Here baseSize is actually an arbitrary scale parameter related to
    // how the optimization is done. Can we compute a "natural" value??
    const equality = deepCopy( UNCONSTRAINED );
    const leq = deepCopy( UNCONSTRAINED );

    for ( let i = 0; i < constraints.length; ++i ) {
        try {
            const parsed = parseConstraint( constraints[i] );
            if ( parsed === void 0 ) {
                debug( `Invalid constraint: ${constraints[i]}.` );
                continue;
            }
            const coefs = parsed.coefs;
            if ( !Object.keys(coefs).every( nodeName => nodesInOrder.includes(nodeName) ) ) {
                debug( 'Constraint ignored because it references a non-existing node' );
                continue;
            }
            // Convert each constraint into a vector of coefficients and a right-hand-side
            // When the anchor is not 'center', we add an offset to the right-hand side
            // to account for the anchor position relative to the center. This offset
            // depends on nodeSize, nodeWidthToHeight, and scale, as the anchor
            // corresponds to a point on the bounding box around the node.
            // We also need to combine all the coefficients (and rhs's) for different anchors
            // on the same node
            const combinedCoefs = nodesInOrder.map( name =>
                anchoredTerms( coefs[name],
                               {
                                   scale,
                                   size: nodes[name].nodeSize,
                                   widthToHeight: nodes[name].nodeWidthToHeight
                               } )
            );
            debug( 'combined coefs =', JSON.stringify( combinedCoefs, null, 2) );  // ATTN: TEMP
            const cRow = combinedCoefs.reduce( (row, cCoef) => {
                row.push( cCoef.xCoef );
                row.push( cCoef.yCoef );
                return row;
            }, []);
            const rhs = combinedCoefs.reduce( (adj, cCoef) => adj + cCoef.rhsAdjust,
                                              parsed.rhs );

            switch ( parsed.relation ) {
                case '=':
                    equality.matrix.push( cRow );
                    equality.rhs.push( rhs );
                    break;

                case '<=':
                case '<':
                    leq.matrix.push( cRow );
                    leq.rhs.push( rhs );
                    break;

                case '>=':
                case '>':
                    leq.matrix.push( cRow.map( c => -c ) );
                    leq.rhs.push( -rhs );
                    break;

                default:
                    throw new Error( `Invalid constraint relation ${parsed.relation}` );
            }
        } catch ( parseError ) {
            throw parseError;  // ATTN: TEMP
        }
    }
    return { equality, leq };
};


module.exports = {
    UNCONSTRAINED,
    convertConstraints,
    // For testing
    parseConstraint,
    anchoredTerms
};
