const isObjectLike = require( '@stdlib/assert-is-object-like' );
const isFunction = require( '@stdlib/assert-is-function' );
const isArray = require( '@stdlib/assert-is-array' );
const copy = require( '@stdlib/utils-copy' );
const isObject = require( '@stdlib/assert-is-plain-object' );
const hasOwnProp = require( '@stdlib/assert-has-own-property' );
const graphSchema = require( './spec/graph-schema.json' );
const BASE_GRAPH = require( './spec/base-graph.json' );

/**
 * Returns a new base graph.
 *
 * @returns {Object} new base graph
 */
function baseGraph() {
    return copy( BASE_GRAPH );
}

/**
 * Checks if the value of a nested key should be an array according to a schema.
 *
 * @param {Array<string>} keys - list of keys forming a path in the schema
 * @returns {boolean} whether the nested key should be an array
 */
const shouldBeArray = keys => {
    const valType = typeOfNestedKey( graphSchema, keys);
    return valType === 'array' || (valType && valType.indexOf( 'array' ) >= 0);
};

/**
 * Returns unique values from an array.
 *
 * @param {Array} a - input array
 * @returns {Array} array with unique values
 */
const uniquify = a => {
    const set = new Set( a );
    const values = set.values();
    if ( set.size === 1 ) {
        return values.next().value;
    }
    return Array.from( values );
};

/**
 * Returns the type of a nested key in a JSON schema.
 *
 * @param {Object} schema - JSON schema
 * @param {Array<string>} keys - list of keys forming a path in the schema
 * @returns {string|null} type of the nested key or null if key is not found in the schema
 */
function typeOfNestedKey(schema, keys) {
    // Start at the top level of the schema
    let currentSchema = schema;

    for (let key of keys) {
        if ( isArray( currentSchema ) ) {
            currentSchema = currentSchema.map( cs => typeStep( cs, key ) ).filter( x => x !== null );
            if ( currentSchema.length === 1 ) {
                currentSchema = currentSchema[ 0 ];
            } else if ( currentSchema.length === 0 ) {
                return null;
            }
            continue;
        }
        currentSchema = typeStep( currentSchema, key );
    }

    // Once we've traversed the whole key path, return the type of the final key
    return currentSchema === null ? null : schemaType( currentSchema );

    function typeStep(currentSchema, key)  {
        if ( currentSchema.type === 'array' ) {
            if ( /^\d+$/.test( key ) ) {
                if ( isObject( currentSchema.items ) ) {
                    return currentSchema.items;
                }
                // Case: items is an array
                const itemType = currentSchema.items[ key ];
                return itemType || null;
            }
            throw new Error( `Invalid key ${key} for array.` );
        }
        // If the current schema has properties and the key is one of them,
        // then go down one level in the schema
        if (currentSchema.properties && currentSchema.properties[key]) {
            currentSchema = currentSchema.properties[key];
        } else if (currentSchema.additionalProperties && typeof currentSchema.additionalProperties === 'object') {
            // If the key is not found in properties, check in additionalProperties
            currentSchema = currentSchema.additionalProperties;
        } else if (currentSchema.anyOf || currentSchema.oneOf ) {
            currentSchema = currentSchema.anyOf || currentSchema.oneOf;
        } else if ( currentSchema['$ref'] ) {
            currentSchema = typeStep( schema['$defs'][ currentSchema['$ref'].slice('#/$defs/'.length) ], key );
        } else {  // The key is not found at this level
            currentSchema = null;
        }
        while ( currentSchema && currentSchema['$ref'] ) {
            currentSchema =  typeStep( schema['$defs'][ currentSchema['$ref'].slice('#/$defs/'.length) ], key );
        }
        return currentSchema;
    }

    function schemaType( schemaElt ) {
        if ( isArray( schemaElt ) ) {
            return uniquify( schemaElt.map( s => schemaType( s ) ) );
        }
        if ( hasOwnProp( schemaElt, 'type' ) ) {
            return schemaElt.type;
        } else if ( hasOwnProp( schemaElt, 'enum' ) ) {
            return uniquify( schemaElt.enum.map( x => typeof x ) );
        } else if ( hasOwnProp( schemaElt, 'const' ) ) {
            return typeof schemaElt.const;
        } else if ( hasOwnProp( schemaElt, 'oneOf') ) {
            return uniquify( schemaElt.oneOf.map( s => schemaType( s ) ) );
        } else if ( hasOwnProp( schemaElt, 'anyOf' ) ) {
            return uniquify( schemaElt.anyOf.map( s => schemaType( s ) ) );
        } else if ( hasOwnProp( schemaElt, '$ref' ) ) {
            return schemaType( schema['$defs'][ schemaElt['$ref'].slice('#/$defs/'.length) ] );
        }
        throw new Error( 'Unrecognized schema form: ' + JSON.stringify( schemaElt, null, 2 ) );
    }
}

/**
* Sets a nested property.
*
* @param {Object} obj - input object
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
            if ( !hasOwnProp( v, p ) && !(isArray(v) && p === 'push') ) {
                if ( create ) {
                    if ( shouldBeArray( props.slice(0, i + 1) ) ) {
                        v[ p ] = [];
                    } else {
                        v[ p ] = {};
                    }
                } else {
                    break;
                }
            }
            if ( i === len-1 ) {
                if ( isFunction( val ) ) {
                    v[ p ] = val( v[ p ] );
                } else if ( remove && val === void 0 ) {
                    if ( isArray( v ) ) {  // ATTN: p should be an index here
                        v.splice( p, 1 );
                    } else {
                        delete v[ p ];
                    }
                } else if ( p === 'push' ) {
                    if ( isArray( v ) ) {
                        v.push( val );
                    } else if ( v === void 0 ) {
                        v = [ val ];
                    } else {
                        throw new Error( 'Improperly specified array push in diff' );
                    }
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

/**
 * Validation error class.
 */
class ValidationError extends Error {
    constructor( message, data, context ) {
        super( message );
        this.data = data;
        this.context = context;
    }
}

module.exports = {
    baseGraph,
    deepSet,
    typeOfNestedKey,
    ValidationError
};
