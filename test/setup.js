const { expect } = require( '@jest/globals' );

function toProjectTruthy( state, projections, step ) {
    const pass = !!projections[step](state);
    if ( pass ) {
        return { message: () => `expected ${this.utils.printReceived(state)} to not match projection constraint ${step}`, pass };
    }
    return { message: () => `expected ${this.utils.printReceived(state)} to match projection constraint ${step}`, pass };
}
expect.extend({ toProjectTruthy, });
