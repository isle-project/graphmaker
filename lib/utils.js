const isObjectLike = require( '@stdlib/assert-is-object-like' );
const isFunction = require( '@stdlib/assert-is-function' );
const hasOwnProp = require( '@stdlib/assert-has-own-property' );
const isArray = require( '@stdlib/assert-is-array' );

/**
 * Returns a new base graph.
 */
function baseGraph() {
    return {
        directed: false,
        hasParents: false,
        categories: [],
        nodes: {},
        edges: {},
        adjacency: {},
        constraints: []
    };
}

/**
* Sets a nested property.
*
* @private
* @param {ObjectLike} obj - input object
* @param {Array} props - list of properties defining a key path
* @param {boolean} create - boolean indicating whether to create a path if the key path does not already exist
* @param {boolean} remove - boolean indicating whether to delete a property if the value to set is `undefined`
* @param {*} val - value to set
* @returns {boolean} boolean indicating if the property was successfully set
*/
function deepSet( obj, props, create, remove, val ) {

    let bool;
    let len;
    let v;
    let p;
    let i;

    len = props.length;
    bool = false;
    v = obj;
    for ( i = 0; i < len; i++ ) {
        p = props[ i ];
        if ( isObjectLike( v ) ) {
            if ( !hasOwnProp( v, p ) ) {
                if ( create ) {
                    v[ p ] = {};
                } else {
                    break;
                }
            }
            if ( i === len-1 ) {
                if ( isFunction( val ) ) {
                    v[ p ] = val( v[ p ] );
                } else if ( remove && val === void 0 ) {
                    if ( isArray( v[ p ] ) ) {
                        v[ p ].splice( p, 1 );
                    } else {
                        delete v[ p ];
                    }
                } else if ( p === 'push' && isArray( v ) ) {
                    // ATTN: get the right array and handle when array is missing
                    v.push( val );
                } else {
                    v[ p ] = val;
                }
                bool = true;
            } else {
                v = v[ p ];
            }
        } else {
            break;
        }
    }
    return bool;
}

module.exports = {
    baseGraph,
    deepSet
};
