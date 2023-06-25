/**
 * An implementation of the Maybe<a> = Nothing | Just<a> type family
 * that encapsulates an optional value. 
 *
 * A value is an instance of `Maybe.Type` if it is either equal to the
 * singleton `Maybe.nothing` value or has the form `Maybe.just(value)`.
 *
 * The `Maybe` object exposes several static properties and methods:
 * 
 * Maybe.Type - the type of a maybe object that can be used in `instanceof`.
 *    Note that this does not represent the type of the wrapped value,
 *    only that the value is a maybe object.
 * 
 * Maybe.nothing {Object} - a singleton representing the absence
 *    of a value.
 *
 * Maybe.just {function(A): Maybe.Type<A>} - a present value wrapped
 *    in a maybe object.
 *
 * Maybe.isNothing {function(Maybe.Type<A>): boolean} - returns true
 *    if the value equals `Maybe.nothing`, else false.
 *
 * Maybe.isJust {function(Maybe.Type<A>): boolean} - returns true
 *    if the argument is a maybe object that is not nothing, else false.
 *
 * In addition, each maybe object supports the following methods:
 *
 * map {function(this: Maybe.Type<A>, f: A => B): Maybe.Type<B>} -
 *    Functorial map using function `f`. If `this` is nothing, returns
 *    nothing; if `this` is Just x, returns Just f(x).
 * 
 * toValue {function(this: Maybe.Type<A>, defaultValue: B): A|B} -
 *    Returns the wrapped value of Just a or `defaultValue` for Nothing.
 * 
 * get {function(this: Maybe.Type<A>, key: string|Array<string>|null, defaultValue: any): any} -
 *    Accesses a nested key in a wrapped object or array of the form Just obj.
 *    The key is either a sequence of prop names (including non-negative integers
 *    for array indices) separated by '.', or an array of such names in order.
 *    If the key is an empty string or null, the entire value will be
 *    returned equivalent to `toValue`.
 *
 *    If `this` isNothing or if a prop name at any value is missing,
 *    returns `defaultValue`, else returns the nested value in the object.
 *    An error is raised if trying to index into a non-object-like field.
 * 
 */

/*
 * @template A
 * @typedef {{nothing: null} | { just: A; }} MaybeType<A>
 */ 


const isArray = require( '@stdlib/assert-is-array' );
const hasOwnProp = require( '@stdlib/assert-has-own-property' );
const isObject = require( '@stdlib/assert-is-plain-object' );
const isObjectLike = require( '@stdlib/assert-is-object-like' );


// Main interface

const Maybe = {
    /** The (meta-)type of maybe objects; can be used with instanceof */
    Type: MaybeType,

    /**
     * The nothing value for maybe types, a singleton.
     *
     * @template A
     * @const {MaybeType<A>}
     */
    nothing: (() => {
        const obj = {
            nothing: null,         // For cosmetic purposes only
            map: function( _ ) {
                return this;
            },
            toValue: function( defaultValue = null ) {
                return defaultValue;
            },
            get: function( _key, defaultValue = null ) {
                return defaultValue;
            },
            join: function() {
                return this;
            }
        };
        obj.__proto__ = MaybeType.prototype;
        return obj;})(),

    /**
     * Function that wraps a value in a maybe type.
     *
     * @template A
     * @param {A} x - an arbitrary value to be wrapped
     * @returns {MaybeType<A>} 
     */
    just: function(x) {
        const obj = {
            just: x,
            map: function( f ) {
                return Maybe.just( f(this.just) );
            },
            toValue: function( _defaultValue ) {
                return this.just;
            },
            get: function( key, defaultValue ) {
                const path = key
                      ? isArray(key)
                        ? key
                        : key.split('.')
                      : [];  // Acts like .toValue() with empty/missing key
                let here = this.just;
                for( const prop of path ) {
                    if ( !isObjectLike( here ) ) {
                        throw new Error( `Non-object-like value on path ${key} in ${this.toString()}`);
                    }
                    if ( /* !isObjectLike( here ) ||*/ !hasOwnProp( here, prop) ) {
                        return defaultValue;
                    }
                    here = here[prop];
                }
                return here;
            },
            join: function() {
                if ( this.just instanceof MaybeType ) {
                    return this.just;
                }
                throw new Error('Attempt to join a Maybe.Type<A> where A is not a Maybe.Type.');
            }
        };
        obj.__proto__ = MaybeType.prototype;
        return obj;
    },

    /**
     * Tests if a maybe object equals Nothing.
     *
     * @template A
     * @param {MaybeType<A>} m - a maybe object
     * @returns {boolean} - is `m` nothing? 
     */
    isNothing: function(m) {
        return m === Maybe.nothing;
    },
    /**
     * Tests if a maybe object equals Just x for some x.
     *
     * @template A
     * @param {MaybeType<A>} m - a maybe object
     * @returns {boolean} - is `m` a non-nothing maybe object? 
     */
    isJust: function(m) {
        return (m instanceof MaybeType) && hasOwnProp(m, 'just');
    }
};


//
// Private class used for `instanceof` and representation methods.
// This should never be instantiated with new; the factory methods
// in Maybe (nothing, just) should be used.
//

function MaybeType() {
    throw new Error('Private constructor should not be called');
}

MaybeType.prototype.toString = function() {
    if ( this === Maybe.nothing ) {
        return "Nothing";
    }
    
    if ( isObjectLike( this.just ) ) {
        return `Just ${JSON.stringify(this.just)}`;
    }
    return `Just ${this.just}`;
};

// Provide a nice representation at the Node REPL

const isNode = (() => {
    try {
        return process !== void 0 && process.versions !== null && process.versions.node !== null;
    } catch (_) {
        return false;
    }
})();

if ( isNode ) {
    const util = require('util');
    MaybeType.prototype[util.inspect.custom] = function(depth, options) {
        return this.toString();
    };
}


module.exports = Maybe;
