const nearley = require("nearley");
const grammar = nearley.Grammar.fromCompiled( require("./constraint-grammar.js") );

/** Parses a single constraint string into a descriptive object.
 *
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

/** Converts a list of constraint string into constraint matrices and vectors.
 *
 *
 * @return {Object}
 */
const convertConstraints = (constraints, nodesInOrder) => {
    const eq = { matrix: [], rhs: [] };
    const leq = { matrix: [], rhs: [] };

    for ( let i = 0; i < constraints.length; ++i ) {
        try {
            const parsed = parseConstraint( constraints[i] );
            if ( parsed === void 0 ) {
                throw new Error( `Invalid constraint: ${constraints[i]}.` );
            }
            const coefs = parsed.coefs;
            switch ( parsed.relation ) {
                case '=':
                    eq.matrix.push( nodesInOrder.reduce( (row, key) => {
                        return row.concat( coefs[key] || [0, 0] );
                    }, []) );
                    eq.rhs.push( parsed.rhs );
                    break;

                case '<=':
                    leq.matrix.push( nodesInOrder.reduce( (row, key) => {
                        return row.concat( coefs[key] || [0, 0] );
                    }, []) );
                    leq.rhs.push( parsed.rhs );
                    break;

                case '>=':
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
    return { eq, leq };
};


module.exports = {
    convertConstraints,
    // For testing
    parseConstraint
};
