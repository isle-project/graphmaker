const { constrainedEquilibrate
      , nodePositions
      , UNCONSTRAINED
      } = require( '../lib/node-position.js' );


// Constants

const TOLERANCE = 2 ** -18;
const EQ_OPTIONS = { tol: TOLERANCE };
const DIGITS_TO_ZERO = 6;


// Helpers

/**
 * Computes the dot product of two vectors of the same dimension
 *
 * @param {Array} v1 - a vector as an array of numbers
 * @param {Array} v2 - a vector as an array of numbers
 *
 * @returns {number} the dot product v1 . v2.
 */
const dot = ( v1, v2 ) => {
    let prod = 0.0;
    for ( let i = 0; i < v1.length; ++i ) {
        prod += v1[i] * v2[i];
    }
    return prod;
};

/** Computes Euclidean distance between two vectors */
const euclidean = (x, y) => {
    const d0 = x[0] - y[0];
    const d1 = x[1] - y[1];
    return Math.sqrt( d0 * d0 + d1 * d1 );
};

/** Computes Euclidean norm of a vector */
const norm = (x) => {
    const d0 = x[0];
    const d1 = x[1];
    return Math.sqrt( d0 * d0 + d1 * d1 );
};

/** Multiplies a matrix by a vector */
const mmul = (M, v) => {
    if ( M[0].length === v.length ) {
        return M.map( row => dot( row, v ) );
    }
    return (void 0);
};

/** Scales a vector (array) by a constant. */
const vscale = (v, c) => v.map( y => c * y );

/** Computes affine transformation a x + b y + c 1 for vectors (arrays) x, y, 1 */
const vaffine = (x, y, a = 1, b = 1, c = 0) => x.map( (val, ind) => a*val + b*y[ind] + c );


// Tests

test( 'simple-position-symmetry',  () => {
    let actual;
    let diff;

    // Single point at the origin
    actual = constrainedEquilibrate( [ [1, 2] ], UNCONSTRAINED, UNCONSTRAINED, EQ_OPTIONS );
    expect( actual.converged ).toBeTruthy();
    expect( norm(actual.positions[0]) ).toBeCloseTo( 0, DIGITS_TO_ZERO );

    actual = nodePositions( 1, UNCONSTRAINED, UNCONSTRAINED, EQ_OPTIONS );
    expect( actual.converged ).toBeTruthy();
    expect( norm(actual.positions[0]) ).toBeCloseTo( 0, DIGITS_TO_ZERO );

    // Two points reflections of each other relative to the origin
    actual = nodePositions( 2, UNCONSTRAINED, UNCONSTRAINED, EQ_OPTIONS );
    expect( actual.converged ).toBeTruthy();
    diff = [
        actual.positions[0][0] + actual.positions[1][0],
        actual.positions[0][1] + actual.positions[1][1]
    ];
    expect( norm(diff) ).toBeCloseTo( 0, DIGITS_TO_ZERO );


    // Three points form an equliteral triangle around the origin
    actual = nodePositions( 3, UNCONSTRAINED, UNCONSTRAINED, EQ_OPTIONS );
    expect( actual.converged ).toBeTruthy();
    expect( actual.positions.reduce( (avg, x) => avg + x[0]/3, 0) ).toBeCloseTo( 0,  DIGITS_TO_ZERO );
    expect( actual.positions.reduce( (avg, x) => avg + x[1]/3, 0) ).toBeCloseTo( 0,  DIGITS_TO_ZERO );
    // ATTN: More specific test?

    // Four points form a square around the origin
    actual = nodePositions( 4, UNCONSTRAINED, UNCONSTRAINED, EQ_OPTIONS );
    expect( actual.converged ).toBeTruthy();
    expect( actual.positions.reduce( (avg, x) => avg + x[0]/4, 0) ).toBeCloseTo( 0,  DIGITS_TO_ZERO );
    expect( actual.positions.reduce( (avg, x) => avg + x[1]/4, 0) ).toBeCloseTo( 0,  DIGITS_TO_ZERO );
    // ATTN: More specific test?
});

test( 'simple-equality-constraints', () => {
    let actual;
    let init;

    const midpointConstraint = { matrix: [ [0.5, 0, 0.5, 0, -1, 0], [0, 0.5, 0, 0.5, 0, -1] ], rhs: [ 0, 0] };
    init = [ [1, 2], [-1, -2], [-1, 2] ];
    actual = constrainedEquilibrate( init, midpointConstraint, UNCONSTRAINED, EQ_OPTIONS );
    expect( actual.converged ).toBeTruthy();
    expect( norm(mmul(midpointConstraint.matrix, actual.positions.flat())) ).toBeCloseTo( 0, DIGITS_TO_ZERO );


    const samecol3Constraint = { matrix: [ [1, 0, -1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, -1, 0, 0, 0, 0, 0] ], rhs: [ 0, 0] };
    init = [ [1, 2], [-1, -2], [-1, 2], [-0.5, 1], [1, -3] ];
    actual = constrainedEquilibrate( init, samecol3Constraint, UNCONSTRAINED, EQ_OPTIONS );
    expect( actual.converged ).toBeTruthy();
    console.log(actual);
    expect( norm(mmul(samecol3Constraint.matrix, actual.positions.flat())) ).toBeCloseTo( 0, DIGITS_TO_ZERO );
});
