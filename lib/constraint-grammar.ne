@{%
const moo = require("moo");
const deg2rad = require('@stdlib/math-base-special-deg2rad');

const lexer = moo.compile({
  ws: { match: /\s+/, lineBreaks: true },
  number: { match: /(?:-?\d+(?:\.\d+)?|-?\.\d+|0)/, value: numstr => Number(numstr) },
  func: { match: /(?:sin|cos|tan|sqrt|abs|min|max)/, value: s => s.toUpperCase() },
  node: {
            match: /(?:'[^'\n]+'|[A-Za-z][-A-Za-z0-9_:<>,;]*)/,
            value: s => {
                if ( s.startsWith("'") ) {
                    return s.slice(1, -1);
                }
                return s;
            }
        },
  dim: { match: /\.\s*[xy]/, value: s => s.slice(s.length - 1) },
  anchor: {
      match: /\s*@\s*(?:ne|nw|se|sw|n|e|s|w|c)/,
      value: s => /ne|nw|se|sw|n|e|s|w|c/.exec(s)[0].toUpperCase() // Must match!
  },
  lparen: '(',
  rparen: ')',
  comma: ',',
  plusOrMinus: /[-+]/,
  mult: '*',
  div: '/',
  eq: /[<>]?=/,
  unrecognized: moo.error
});

function dropWhitespace( data ) {
    return data.filter( item => item !== null );
}

function ignore( _ ) {
    return null;
}

function sumConstants( acc, item ) {
    if ( item.type === 'NUMBER' ) {
        return acc + item.coef;
    }
    return acc;
}

function evaluateFunction(funcName, args) {
    // Convert angles from degrees to radians for trig functions
    const arg = funcName === 'SIN' || funcName === 'COS' || funcName === 'TAN' ? deg2rad(args[0]) : args[0];
    
    switch(funcName) {
        case 'SIN': return Math.sin(arg);
        case 'COS': return Math.cos(arg);
        case 'TAN': return Math.tan(arg);
        case 'SQRT': return Math.sqrt(args[0]);
        case 'ABS': return Math.abs(args[0]);
        case 'MIN': return Math.min(...args);
        case 'MAX': return Math.max(...args);
        default: throw new Error(`Unknown function: ${funcName}`);
    }
}

/**
 * Transforms a parse tree for a single constraint into a simpler form.
 *
 * @param {Object} data - the data from parsing a single constraint
 * @returns {Object} an object describing the constraint with the
 *     following fields
 *         {Object.<string, Object.<string, [number,number]>} coefs -
               Maps nodes to a map of anchors to [x,y] coefficient vectors
 *         {number} rhs - (derived) constant value on the right-hand of the constraint
 *         {string} relation - the constraint operator ('=', '<=', '>=')
 * This is the result of a single parse of a single constraint string.
 */

function processConstraint( data ) {
    const [lhsTerms, op, rhsTerms] = dropWhitespace( data );
    let rhs = rhsTerms.reduce( sumConstants, 0 ) - lhsTerms.reduce( sumConstants, 0 );

    // Final rhs is sum of NUMBERs in rhs terms minus sum of NUMBERs in lhs terms.
    // Coefficients in rhs terms multiplied by -1.
    // Coefs are reduced by merge, combining repeated nodes by summing.

    const coefs = lhsTerms.
        concat( rhsTerms.reduce( (coll, item) => {
            if ( item.type === 'TERM' ) {
                coll.push( { ...item, coef: -1 * item.coef } );
            }
            return coll;
        }, [] ) ).
        reduce( (acc, node) => {
            const name = node.node;
            const anchor = node.anchor;
            const dim = node.coord === 'x' ? 0 : 1;
            if ( acc[name] !== void 0 && acc[name][anchor] !== void 0 ) {
                acc[name][anchor][dim] += node.coef;
            } else if ( acc[name] !== void 0 ) {
                const coefs = [0, 0];
                coefs[dim] = node.coef;
                acc[name][anchor] = coefs;
            } else {
                const coefs = [0, 0];
                coefs[dim] = node.coef;
                acc[name] = {[anchor]: coefs};
            }
            return acc;
        }, {});

    return { coefs, rhs, relation: op.value };
}


%}

# Pass your lexer object using the @lexer option:
@lexer lexer

constraint -> expr _ %eq _ expr                              {% processConstraint %}

expr -> pterm                                                {% id %}
     |  expr _ %plusOrMinus _ pterm                          {%
             function( data ) {
                 const [lhs, op, rhs] = dropWhitespace( data );
                 const sign = (op.value === '-') ? -1 : 1;
                 return lhs.concat( rhs.map( trm => ({
                                        ...trm,
                                        coef: trm.coef * sign
                                        })) );
             }
        %}

pterm -> term                                             {% 
             function( data ) {
                 return Array.isArray(data[0]) ? data[0] : [data[0]];
             }
         %}
       | %number maybeMult coordinateGroup                  {%
             function( data ) {
                 const coords = data[data.length - 1];
                 const coef = data[0].value;
                 return coords.map( coord => ({
                         ...coord,
                         coef: coord.coef * coef
                        }) );
             }

         %}
       | functionCall maybeMult coordinateGroup            {%
             function( data ) {
                 const coords = data[data.length - 1];
                 const coef = data[0];
                 return coords.map( coord => ({
                         ...coord,
                         coef: coord.coef * coef
                        }) );
             }
         %}
       | %number maybeMult functionCall                     {%
             function( data ) {
                 const num = data[0].value;
                 const func = data[data.length - 1];
                 return [{
                     type: 'NUMBER',
                     coef: num * func
                 }];
             }
         %}
       | functionCall maybeMult %number                     {%
             function( data ) {
                 const func = data[0];
                 const num = data[data.length - 1].value;
                 return [{
                     type: 'NUMBER',
                     coef: func * num
                 }];
             }
         %}
       | coordinateGroup _ %div _ %number                   {%
             function( data ) {
                 const coords = data[0];
                 const coef = 1.0 / data[data.length - 1];  // ATTN:check error if value is zero
                 return coords.map( coord => ({
                         ...coord,
                         coef: coord.coef * coef
                        }) );
             }
         %}

term -> %number maybeMult coordinate                        {%
            function( data ) {
                const coord = data[data.length - 1];
                const num = data[0].value;
                return { ...coord, coef: coord.coef * num };
            }
        %}
      | functionCall maybeMult coordinate                   {%
            function( data ) {
                const coord = data[data.length - 1];
                const num = data[0];
                return { ...coord, coef: coord.coef * num };
            }
        %}
      | coordinate _ %div _ %number                         {%
            function( data ) {
                const coord = data[0];
                const num = data[data.length - 1].value;     // ATTN: Check for 0
                return { ...coord, coef: coord.coef / num };
            }
        %}
      | coordinate                                          {% id %}
      | %number                                             {%
             function( data ) {
                 return {
                     type: 'NUMBER',
                     coef: data[0].value
                 };
             }
        %}
      | functionCall                                       {%
             function( data ) {
                 return {
                     type: 'NUMBER',
                     coef: data[0]
                 };
             }
        %}

maybeMult -> _ %mult _                                      {% ignore %}
           | _                                              {% ignore %}

coordinateGroup -> %lparen _ coordinateSum _ %rparen        {%
                       function( data ) {
                           return dropWhitespace(data)[1];
                       }
                   %}

coordinateSum -> coordinateSum _ %plusOrMinus _ coordinate {%
                     function( data ) {
                         const [acc, op, coord] = dropWhitespace( data );
                         const sign = op.value === '-' ? -1 : 1;
                         acc.push( { ...coord, coef: sign * coord.coef } );
                         return acc;
                     }
                 %}
              |  coordinate

coordinate -> %node _ %dim                                  {%
                  function( data ) {
                      const [name, axis, anchor] = dropWhitespace( data );
                      return {
                          type: 'TERM',
                          coef: 1.0,
                          node: name.value,
                          coord: axis.value,
                          anchor: 'C'
                      };
                  }
              %}
           |  %node %anchor _ %dim                          {%
                  function( data ) {
                      const [name, anchor, axis] = dropWhitespace( data );
                      return {
                          type: 'TERM',
                          coef: 1.0,
                          node: name.value,
                          coord: axis.value,
                          anchor: anchor.value
                      };
                  }
              %}

_ -> %ws                                                    {% ignore %}
   | null                                                   {% ignore %}

functionCall -> %func _ %lparen _ functionArgs _ %rparen    {%
                    function( data ) {
                        const func = data[0];
                        const args = data[4];
                        return evaluateFunction( func.value, args );
                    }
                %}

functionArgs -> %number                                     {%
                    function( data ) {
                        return [ data[0].value ];
                    }
                %}
              | %number _ %comma _ functionArgs             {%
                    function( data ) {
                        const num = data[0];
                        const rest = data[4];
                        return [ num.value, ...rest ];
                    }
                %}
