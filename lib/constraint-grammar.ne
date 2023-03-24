@{%
const moo = require("moo");

const lexer = moo.compile({
  ws: { match: /\s+/, lineBreaks: true },
  number: { match: /(?:-?\d+(?:\.\d+)?|-?\.\d+|0)/, value: numstr => Number(numstr) },
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
  lparen: '(',
  rparen: ')',
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
            const dim = node.coord === 'x' ? 0 : 1;
            if ( acc[name] !== void 0 ) {
                acc[name][dim] += node.coef;
            } else {
                const coefs = [0, 0];
                coefs[dim] = node.coef;
                acc[node.node] = coefs;
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

pterm -> term
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
                      const [name, axis] = dropWhitespace( data );
                      return {
                          type: 'TERM',
                          coef: 1.0,
                          node: name.value,
                          coord: axis.value
                      };
                  }
              %}

_ -> %ws                                                    {% ignore %}
   | null                                                   {% ignore %}
