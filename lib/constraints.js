const nearley = require('nearley');
const grammar = nearley.Grammar.fromCompiled( require('./constraint-grammar.js') );
const deepCopy = require( '@stdlib/utils-copy' );
const debug = require( 'debug' )( 'graphmaker:constraints' );

// Constants

const UNCONSTRAINED = { matrix: [], rhs: [] };


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
const convertConstraints = (constraints, nodesInOrder) => {
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
            switch ( parsed.relation ) {
                case '=':
                    equality.matrix.push( nodesInOrder.reduce( (row, key) => {
                        return row.concat( coefs[key] || [0, 0] );
                    }, []) );
                    equality.rhs.push( parsed.rhs );
                    break;

                case '<=':
                case '<':
                    leq.matrix.push( nodesInOrder.reduce( (row, key) => {
                        return row.concat( coefs[key] || [0, 0] );
                    }, []) );
                    leq.rhs.push( parsed.rhs );
                    break;

                case '>=':
                case '>':
                    leq.matrix.push( nodesInOrder.reduce( (row, key) => {
                        if ( coefs[key] ) {
                            row.push( -coefs[key][0] );
                            row.push( -coefs[key][1] );
                            return row;
                        }
                        return row.concat( [0, 0] );
                    }, []) );
                    leq.rhs.push( -parsed.rhs );
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
    parseConstraint
};
