/**
 * node-positions - randomized algorithm to compute nice node positions
 *
 */

const debug        = require( 'debug' )( 'graphmaker:position' );
const objectKeys   = require( '@stdlib/utils-keys' );
const randomNormal = require( '@stdlib/random-base-normal' );
const { SVD }      = require( 'svd-js' );
const { UNCONSTRAINED
      , convertConstraints
      }            = require( './constraints.js' );


// Constants

const EPSILON = 2 ** -20;  // Used for zero tests


//
// Helpers
//

/**
 * Computes Coulomb force between two charges, numerically stable when close together.
 *
 * The charges are assumed to have the same sign and magnitude. This computes the
 * resulting repulsive force of one charge on the other, giving a vector pointing
 * in the dx, dy direction.
 *
 * If the points are too close together to get a numerically stable force,
 * the force is capped in a non-Coulomb way, to move the charges apart
 * for the next step in the simulation. This condition will usually only
 * be needed if the starting configuration of the charges happens to put
 * two close together. The simulation will not let the charges approach
 * so close otherwise.
 *
 * @param {number} dx - difference in x-coordinates of the charges
 * @param {number} dx - difference in y-coordinates of the charges
 * @param {number} [epsilon = 2**-20] - tolerance for square distance to be
 *    considered numerically close
 *
 * @returns {array} a numeric pair of the Coulomb force x and y components.
 */
const safeCoulomb = (dx, dy, epsilon = 2**-20) => {
    const rsq = dx * dx + dy * dy;
    if ( rsq > epsilon ) {
        return [dx/rsq, dy/rsq];  // The ordinary Coulomb force
    } else if ( rsq > Number.EPSILON ) {
        // Stabilize the numerically unstable force
        // just to get the two points away from each other.
        const r = Math.sqrt(rsq);
        return [dx/r, dy/r];
    }
    // Bounce away points that are numerically identical,
    // but try to send them in opposite directions.
    // If they are exactly the same, we cannot separate them.
    return [Math.sign(dx),  Math.sign(dy)];
};

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

/**
 * Multiplies a matrix by a vector
 *
 * @param {Array<Array<number>>} M an n x m matrix stored as a list of rows
 * @param {Array<number>} v an m x 1 vector stored as an array
 *
 * @returns {Array|undefined} returns the product M v if the dimensions
 *     of M and v match properly, else undefined.
 */
const mvMult = (M, v) => {
    if ( M[0].length === v.length ) {
        return M.map( row => dot( row, v ) );
    }
    return (void 0);
};

// ATTN:DOC
/**
 * Computes M v when M^T is available, without transposing.
 */
const mvMultT = (Mt, v) => {
    if ( Mt.length === v.length ) {
        const nrow = Mt[0].length;
        const zero = new Array(nrow).fill(0);
        return Mt.reduce( (prod, col, ind) => {
            for ( let i = 0; i < nrow; ++i ) {
                prod[i] += col[i] * v[ind];
            }
            return prod;
        }, zero );
    }
    return (void 0);
};


/** Computes matrix A B^T for naive matrices. */
const mmtMult = (A, Bt) => {
    if ( A[0].length === Bt[0].length ) {
        return A.map( row => Bt.map( col => dot( row, col ) ) );
    }
    return (void 0);
};


/** Scales a vector (array) by a constant. */
const vscale = (v, c, d = 0) => v.map( y => c * y + d );

/** Computes affine transformation a x + b y + c 1 for vectors (arrays) x, y, 1 */
const vaffine = (x, y, a = 1, b = 1, c = 0) => x.map( (val, ind) => a*val + b*y[ind] + c );

/**
 * Partitions an array into non-overlapping chunks of a given size.
 * The last chunk may be shorter if the input array has too few elements.
 *
 * @param {Array} array - any array
 * @param {number} chunkSize - the size of non-overlapping segments
 *
 * @return {Array} an array of arrays, each element of which is a non-overlapping
 *     segment of the original array in order. The elements have size `chunkSize`
 *     except possibly for the last which will contain any elements left.
 */
const partition = ( array, chunkSize ) => {
    return array.reduce(function onReduce(chunked, _, index) {
        if (index % chunkSize === 0) {
            chunked.push(array.slice(index, index + chunkSize));
        }
        return chunked;
    }, []);
};

/**
 * Transpose a matrix in naive row-wise format.
 *
 * @param {Array} matrix - a matrix represented as an array of row arrays.
 *     The matrix is assumed to be non-empty.
 *
 * @returns {Array} the transpose of the matrix in the same format.
 *
 */
const transpose = ( matrix ) => {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const matrixT = Array.from( Array(cols), () => new Array(rows) );

    for ( let row = 0; row < rows; ++row ) {
        for ( let col = 0; col < cols; ++col ) {
            matrixT[col][row] = matrix[row][col];
        }
    }

    return matrixT;
};

/**
 * Computes the SVD of a matrix for any non-empty shape.
 *
 * Note that `svd-js` only works for matrices that have at least as
 * many rows as columns, so we need to handle the dual case
 * specially.
 *
 * @param {Array} matrix a row-wise matrix stored as an
 *     array of rows.
 * @param {boolean} full if true, the full set of singular vectors
 *     for the largest dimension are included in uT or vT; otherwise,
 *     only those up to the rank of the matrix are used.
 *
 * @returns {Object} { uT, vT, lambda } corresponding to the
 *     SVD of A = U D V^T. Here, `uT` and `vT` are matrices,
 *     but note that they are the transpose of the corresponding
 *     SVD matrices, essentially giving lists of the singular vectors.
 *     `lambda` is an array of singular values, not necessarily in
 *     decreasing order.
 */

const svd = ( matrix, full = false ) => {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const withu = full ? 'f' : true;

    if ( rows >= cols ) {
        const { u, v, q } = SVD( matrix, withu );
        return { uT: transpose(u), vT: transpose(v), lambda: q };
    }

    const { u, v, q } = SVD( transpose(matrix), withu );
    return { uT: transpose(v), vT: transpose(u), lambda: q };
};


//
// Constraint Management
//

// Note: Have equality constraints A x = b and inequality constraints
// converted to <= inqualities of the form L x <= c.
// Add non-negative slack variables s to the latter to get an extended
// equation
//
//  | A   0 | | x |   | b |
//  |       | |   | = |   |
//  | L   I | | s |   | c |
//
// Here s = c - L x >= 0.  Write this for short as  C y = v.
// If we have a feasible solution y_0 = (x_0, s_0) and a projection
// P onto the null space of A. Then, with force F_x at feasible x, we set
//
//  x' = x + delta P F_x
//  s' = s - delta L P F_x
//
//  where delta >= 0 is chosen so that s' >= 0 component-wise.
//  If P F_x = 0 or delta = 0 (check this case?), we have converged
//  as the forces run up against the constraints.
//
//  Only question is whether scaling with single delta is sufficient
//  in case that we cannot proceed along P F_x even a little bit.
//  ATTN
//  Example  point C is at the midpoint of A and B and A is above B by 10
//  | -0.5 0 -0.5 0 1 0 0 |   |  0 |
//  | 0 -0.5 0 -0.5 0 1 0 |   |  0 |
//  | 0 -1    0 1   0 0 1 |   |-10 |
//  Feasible solution with C at center will work; try feasible solution
//  with A, C, B above origin.

/**
 * Computes projection matrix onto the kernel of a constraint matrix.
 *
 * Here,
 *
 * Uses only the first `rank` elements of `vT`, so does not require
 * a 'full' svd (but can accept one).
 *
 */

const kernelProjection = ( rank, vT ) => {
    return x => {
        const n = x.length;
        const px = [ ...x ];
        const coefs = new Array( rank ).fill(0);

        // Compute projection coefficients V_0^T x, where
        // V_0 is the matrix of the first rank singular vectors.
        for ( let i = 0; i < n; ++i ) {
            const xi = x[i];
            for ( let k = 0; k < rank; ++k ) {
                coefs[k] += vT[k][i] * xi;
            }
        }

        // Px = x - sum_k (v_k . x) v_k  over 1 <= k <= rank
        // Remember: this is the projection on the null space.
        for ( let i = 0; i < n; ++i ) {
            for ( let k = 0; k < rank; ++k ) {
                px[i] -= coefs[k] * vT[k][i];
            }
        }
        return px;
    };
};

/**
 * Constructs vector that satisfies A x = b using only first rank singular vectors.
 *
 * Requires that at least one of the first rank singular values are non-zero and that there is
 * at least one right singular vector.
 *
 *   x_0 = V_1 Lambda_1^{-1} U^T b
 *
 * where A has right singular vectors [V_1 V_0]  (V_0 is a basis for the null space)
 * and singular value matrix [Lambda_1 0] where Lambda_1 is a square diagonal matrix
 * of singular values.
 */
const meetEqualityConstraints = ( uT, vT, lambda, b ) => {
    const rank = uT.length;
    const n = vT[0].length;
    const scaledUTb = mvMult(uT, b).map( (y, i) => (Math.abs(lambda[i]) <= EPSILON) ? 0 : y / lambda[i] );
    const x0 = new Array( n ).fill(0);

    // ATTN:TEMP
    // const LambdaInv = lambda.map( (lam, i) => {
    //     const row = Array( rank ).fill(0);
    //     row[i] = (Math.abs(lam) <= EPSILON) ? 0 : 1.0 / lam;
    //     return row;
    // } );
    // const VLUT = mmtMult( transpose(vT), transpose(mmtMult( LambdaInv, uT )) );
    // debug( 'VLUT' );
    // debug( VLUT );
    // END:TEMP

    for ( let i = 0; i < n; ++i ) {
        for ( let k = 0; k < rank; ++k ) {
            x0[i] += scaledUTb[k] * vT[k][i];
        }
    }
    return x0;
};

/**
 * Constructs a feasible solution to leq inequality constraints maintaining equality constraints.
 *
 * Starts from a point consistent with equality constraints and maintains that invariant.
 *
 *
 */
const feasibleAdjustLeq = ({ n, c, s, initial, nullspace, constraints, rhs, shift }) => {
    if ( n - c >= s ) {
        const ellV0 = c > 0 ? mmtMult( constraints, nullspace ) : constraints;
        const y = vaffine( rhs, mvMult(constraints, initial), 1, -1, -shift );
        const { uT, vT, lambda } = svd( ellV0 );

        // ATTN!
        // if ( !lambda.every( lam => lam > 0 ) ) {  // ATTN: More careful check here?
        //     throw new Error( 'The matrix L V_0 does not have full row rank; this is not currently supported.' );
        // }

        // L V_0 has full row rank s, so we can compute its pseudo-inverse.
        // Reconstruction of component in null space has form (L V_0)^dagger y.
        // The psuedo-inverse (L V_0)^dagger is the smallest norm element alpha of the
        // nullspace that satisfies L V_0 alpha = y. This is represented here by
        // nullspace V Lambda^-1 U^T, where nullspace contains n - c orthogonal columns
        // of dimention n, V is an n - c * s matrix of orthogonal columns,
        // Lambda is the s * s diagonal matrix of inverted singular values, and V contains
        // only the s right singular vectors for the non-zero singular values.
        let recon = mvMult( transpose(vT), mvMult( uT,  y ).map( (x, i) => x/lambda[i] ) );
        if ( c > 0 ) {
            recon = mvMultT( nullspace, recon );
        }
        return vaffine( initial, recon );
    }
    throw new Error( 'Over-constrained inquality constraints are not yet supported.' );
};


//
// Simulation
//

/**
 * Computes node positions in a graph by electrostatic simulation.
 *
 * @param {Array<Array<number>>} positions - an array of numeric pairs,
 *     each representing the position of one node. The order is arbitrary
 *     but maintained throughout the simulation and result. In particular,
 *     the columns of the constraint matrices should be in the same order.
 * @param {Object} equality - equality constraints on the node positions
 * @param {Array<Array<number>>} equality.matrix - Equality constraint matrix, with one row
 *     per constraint and two columns per node. The matrix is stored in naive
 *     form as an array of rows.
 * @param {Array<number>} equality.rhs - The constraint values ("right hand side")
 *     is a vector with one entry per constraint.
 * @param {Array<Array<number>>} leq.matrix - Inequality constraint matrix, with one row
 *     per constraint and two columns per node. The constraints should all be expressed
 *     in the form of <= inequalities of the form L x <= c. The matrix is stored in naive
 *     form as an array of rows.
 * @param {Array<number>} leq.rhs - The leq constraint values ("right hand side")
 *     is a vector with one entry per constraint.
 * @param {Object} options
 * @param {number}   options.ambient - determines the magnitude of the radial force used to
 *     keep the points in a bounded region; the larger this value the closer together
 *     the nodes will be packed. Default: 1.0
 * @param {number}   options.max_iter - maximum number of iterations in which to converge
 *     Default: 20000
 * @param {number}   options.tol - convergence tolerance on maximum force magnitude
 *     Default: 2**-20
 * @param {number}   options.anneal - factor by which the time step is shrunk
 *     Default: 0.99
 * @param {number}   options.dt - initial time step
 *     Default: 1.0
 *
 * @returns {Object} {positions: Array<Array<number>>, converged: bool, maxForce: number, stopped: number?}
 *     where `positions` is the current configuration of points in the same format and
 *     order as the `positions` argument; `converged` indicates whether the simulation
 *     ended with a maximum force under the tolerance; and `maxForce` is the maximum
 *     force magnitude at the end of the simulation (whether converged or not), projected
 *     onto the null space of the equality constraints. If iteration ends because of the inequality
 *     constraints, the `stopped` property of the returned object is set to the step size
 *     modifier (usually zero) that ended iteration.
 *
 */
const constrainedEquilibrate = (positions, equality = UNCONSTRAINED, leq = UNCONSTRAINED, options = {}) => {
    const rank = equality.matrix.length;  // Number of equality constraints
    const numLE = leq.matrix.length;

    debug( `constrainedEquilibrate: ${positions.length} nodes, ${rank} equality constraints, ${numLE} <= constraints.` );
    debug( 'initial positions', positions );

    const { ambient, max_iter, tol, anneal, dt } = {
        ambient: 1.0,
        max_iter: 20000,
        tol: 2**-20,
        anneal: 0.99,
        dt: 1.0,
        ...options
    };
    const nodes = positions.length;
    const n = nodes * 2;

    if ( rank > 0 && (equality.matrix[0].length !== n || rank !== equality.rhs.length) ) {
        throw new Error( `Equality constraints have incorrect dimensions: ${rank} by ${equality.matrix[0].length} and ${equality.rhs.length} by 1 for ${n} coordinates.` );
    }

    if ( numLE > 0 && (leq.matrix[0].length !== n || numLE !== leq.rhs.length) ) {
        throw new Error( `Inequality constraints have incorrect dimensions: ${rank} by ${leq.matrix[0].length} and ${leq.rhs.length} by 1 for ${n} coordinates.` );
    }

    if ( rank > n ) {
        throw new Error( `Too many constraints: rank ${rank} > ${n}.` );
    }

    let pos = positions.flat();
    let nullProjection = x => x;
    const leqFeasible = ell => ell.every((c, i) => c <= leq.rhs[i]);
    const haveLeq = numLE > 0;

    if ( rank > 0 ) {
        const { uT, vT, lambda } = svd(equality.matrix, haveLeq ? 'f' : false);

        if ( lambda.every(x => Math.abs(x) < tol ) ) {
            throw new Error('Ill-conditioned constraint matrix with singular value near zero');
        }
        // ATTN!
        // if ( lambda.some(x => Math.abs(x) < tol ) ) {
        //     throw new Error('Ill-conditioned constraint matrix with singular value near zero');
        // }

        nullProjection = kernelProjection(rank, vT);
        const feasibleBase = meetEqualityConstraints(uT, vT, lambda, equality.rhs);

        if (rank === n) {
            // There is a unique feasible solution in this case forces don't matter.
            // But we must check that any inequality constraints are satisfied.
            if ( haveLeq && !leqFeasible( mvMult(leq.matrix, feasibleBase) ) ) {
                throw new Error('Given constraints have no feasible solution.');
            }
            // ATTN:TEMP
            debug( 'Unique solution, all constraints satisfied:' );
            debug( feasibleBase );
            // debug( 'Original constraints' );
            // debug( equality.matrix );
            // debug( equality.rhs );
            // ATTN:END TEMP
            return { positions: partition(feasibleBase, 2), converged: true, maxForce: 0 };
        }

        // Initial position is closest feasible solution to given positions
        pos = vaffine( feasibleBase, nullProjection( vaffine( feasibleBase, pos, -1, 1) ) );

        // If we have inequality constraints, adjust initial solution to satisfy them
        if ( haveLeq && !leqFeasible( mvMult(leq.matrix, pos) ) ) {
            pos = feasibleAdjustLeq({ n, c: rank, s: numLE, initial: pos, nullspace: vT.slice(rank), constraints: leq.matrix, rhs: leq.rhs, shift: 1 });
        }
    } else if ( haveLeq && !leqFeasible( mvMult(leq.matrix, pos) ) ) {
        // Inequalities without equality constraints and infeasible initial positions
        pos = feasibleAdjustLeq( { n, c: 0, s: numLE, initial: pos, nullspace: [], constraints: leq.matrix, rhs: leq.rhs, shift: 1 });
    }

    let maxForce = 1e10;
    let iter = 0;
    let converged = false;
    let step = dt;
    let leqDev = haveLeq ? vaffine( leq.rhs, mvMult(leq.matrix, pos), 1, -1) : [];  // Leq constraint deviation d - L x_0
    let delta = 1;

    while ( maxForce > tol && iter < max_iter ) {
        let force = vscale( pos, -ambient ); // Radient ambient field E_p = -p

        for ( let i = 0; i < nodes; ++i ) {
            for ( let j = 0; j < nodes; ++j ) {
                if ( i !== j ) {
                    const dx = pos[2 * i + 0] - pos[2 * j + 0];
                    const dy = pos[2 * i + 1] - pos[2 * j + 1];
                    const [dFx, dFy] = safeCoulomb(dx, dy);

                    force[2 * i + 0] += dFx;
                    force[2 * i + 1] += dFy;
                }
            }
        }

        const effectiveForce = nullProjection( force );

        if ( haveLeq ) {
            // Move as far as we can (up to step) in the effectiveForce direction until
            // either hitting one the leq constraints or the current step size.
            // If the resulting stepsize is zero, indicate convergence but signal the
            // reason we stopped.

            const deltaDev = mvMult(leq.matrix, effectiveForce);
            /* eslint-disable no-loop-func */
            delta = deltaDev.reduce( (del, v, i) => {
                if ( leqDev[i] < step * v ) {   // Since pos feasible, leqDev >= 0
                    return Math.min( del, leqDev[i]/v );
                }
                return del;
            }, 1 );

            if ( Math.abs(delta) < EPSILON ) {
                // We cannot move without violating an inequality constraint
                return { positions: partition(pos, 2), converged: true, maxForce, stopped: delta };
            }

            // Update deviation from leq constraints, which remains non-negative
            for ( let k = 0; k < leqDev.length; ++k ) {
                leqDev[k] -= delta * step * deltaDev[k];
            }
        }

        maxForce = 0.0;
        for ( let i = 0; i < nodes; ++i ) {
            const mag = Math.sqrt(effectiveForce[2 * i + 0] * effectiveForce[2 * i + 0] + effectiveForce[2 * i + 1] * effectiveForce[2 * i + 1]);
            pos[2 * i + 0] += delta * step * effectiveForce[2 * i + 0];
            pos[2 * i + 1] += delta * step * effectiveForce[2 * i + 1];

            if ( mag > maxForce ) {
                maxForce = mag;
            }
        }

        step *= anneal;
        iter += 1;
    }

    if ( iter < max_iter ) {
        converged = true;
    }
    debug( `positions converged: ${converged}, maxForce: ${maxForce}, iterations: ${iter}` );
    debug( 'final positions', partition(pos, 2) );

    return { positions: partition(pos, 2), converged, maxForce };
};

/**
 * Computes node positions in a graph by electrostatic simulation.
 *
 * @param positions {Array<Array<number>>} - an array of numeric pairs,
 *     each representing the position of one node. The order is arbitrary
 *     but maintained throughout the simulation and result.
 * @param {Array<Array<number>>} fixed - an array of nodes whose positions are
 *     fixed but whose presence should influence the positions of other nodes
 * @param {number} ambient - determines the magnitude of the radial force used to
 *     keep the points in a bounded region; the larger this value the closer together
 *     the nodes will be packed.
 * @param {Object} options
 * @param {number}   options.max_iter - maximum number of iterations in which to converge
 *     Default: 20000
 * @param {number}   options.tol - convergence tolerance on maximum force magnitude
 *     Default: 2**-20
 * @param {number}   options.anneal - factor by which the time step is shrunk
 *     Default: 0.99
 * @param {number}   options.dt - initial time step
 *     Default: 1.0
 *
 * @returns {Object} {positions: Array<Array<number>>, converged: bool, maxForce: number}
 *     where `positions` is the current configuration of points in the same format and
 *     order as the `positions` argument; `converged` indicates whether the simulation
 *     ended with a maximum force under the tolerance; and `maxForce` is the maximum
 *     force magnitude at the end of the simulation (whether converged or not).
 *
 */
const equilibrate = (positions, fixed = [], ambient = 1.0,
                     {max_iter = 20000, tol = 2**-20, anneal = 0.99, dt = 1.0} = {}) => {
    const n = positions.length;

    if ( n === 1 ) {
        // Solution known, so avoid numerical ambiguities near zero.
        return { positions: [[0, 0]], converged: true, maxForce: 0 };
    }

    let maxForce = 1e10;
    let iter = 0;
    let converged = false;

    while ( maxForce > tol && iter < max_iter ) {
        let forces = positions.map( p => {
            // Ambient radial field points towards origin and grows towards infinity
            let a = -ambient * p[0];
            let b = -ambient * p[1];

            // Fixed point Coulomb forces on this point
            for ( const q of fixed ) {
                const dx = p[0] - q[0];
                const dy = p[1] - q[1];
                const [dFx, dFy] = safeCoulomb(dx, dy);

                a += dFx;
                b += dFy;
            }
            return [a, b];
        });

        for ( let i = 0; i < n; ++i ) {
            for ( let j = 0; j < n; ++j ) {
                if ( i !== j ) {
                    const dx = positions[i][0] - positions[j][0];
                    const dy = positions[i][1] - positions[j][1];
                    const [dFx, dFy] = safeCoulomb(dx, dy);

                    forces[i][0] += dFx;
                    forces[i][1] += dFy;
                }
            }
        }

        maxForce = 0.0;
        for ( let i = 0; i < n; ++i ) {
            const mag = Math.sqrt(forces[i][0] * forces[i][0] + forces[i][1] * forces[i][1]);
            positions[i][0] += dt * forces[i][0];
            positions[i][1] += dt * forces[i][1];

            if ( mag > maxForce ) {
                maxForce = mag;
            }
        }

        dt *= anneal;
        iter += 1;
    }

    if ( iter < max_iter ) {
        converged = true;
    }

    return { positions, converged, maxForce };
};

/**
 * Computes node positions in a graph by electrostatic simulation with random initial positions.
 *
 * @param {number} n - number of nodes
 * @param {Object} equality - equality constraints on the node positions
 * @param {Object} leq - inequality (<=) constraints on the node positions
 * @param {Object} options - Optional parameters corresponding to the options
 *     argument to `constrainedEquilibrate` (which see). Default: {}
 *
 * @returns {Object} { positions: Array<Array<number>>, converged: bool, maxForce: number }
 *     as described in `equilibrate`.
 */
const randomPositions = ( n, {equality = UNCONSTRAINED, leq = UNCONSTRAINED, ...options } = {}  ) => {
    const positions = [];
    for ( let i = 0; i < n; ++i ) {
        const x = -2.0 + 4 * Math.random();
        const y = -2.0 + 4 * Math.random();
        positions.push([x, y]);
    }
    return constrainedEquilibrate(positions, equality, leq, options);
};

const nodePositions = ( nodes, constraints = [], options = {} ) => {
    const nodesInOrder = objectKeys( nodes );
    const sigma = options.sigma || 2;
    const { equality, leq } = convertConstraints( constraints, nodesInOrder );
    const initialPositions = nodesInOrder.map( key => {
        return [
            nodes[key]?.x === void 0 ? randomNormal(0, sigma) : nodes[key].x,
            nodes[key]?.y === void 0 ? randomNormal(0, sigma) : nodes[key].y
         ];
    });

    return constrainedEquilibrate( initialPositions, equality, leq, options );
};

module.exports = {
    UNCONSTRAINED,
    nodePositions,
    constrainedEquilibrate,
    randomPositions,
    // For testing:
    equilibrate,
    kernelProjection,
    meetEqualityConstraints,
    svd,
    safeCoulomb,
    partition,
    mvMult,
    mvMultT,
    mmtMult,
    dot,
    transpose,
    vscale,
    vaffine
};
