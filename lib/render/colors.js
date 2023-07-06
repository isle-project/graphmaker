/* eslint-disable no-cond-assign */

const convert = require('color-convert');
const lowercaseKeys = require( '@stdlib/utils-lowercase-keys' );
const supportedColors = lowercaseKeys( require('./../spec/supported-colors.json') );

/**
 * Converts the provided color specification into an RGB array.
 *
 * The function can handle color specifications in hexadecimal format (#RRGGBB),
 * color keywords (e.g. "red"), HSL, CMYK, and RGB(A) format.
 *
 * @param {string} colorSpec - color specification
 * @param {boolean} [strict=true] - if true, digits will be removed and the color will be converted to lowercase. This only applies when colorSpec is a color keyword
 * @returns {Array<number>} an array of three or four numbers representing the red, green, blue, and optionally alpha components of the color, where each component is in the range [0, 255]
 * @throws {Error} throws an error when the color specification is not supported
 */
function colorAsRGB( colorSpec, strict = true ) {
    const color = colorSpec.replaceAll( ' ', '' ).toLowerCase();
    const colorStrict = strict  // If true, remove digits and downcase
        ? color
            .replace( /[0-9]/g, '' )
            .toLowerCase()
        : color;
    let m;

    if ( colorSpec.startsWith( '#') ) {
        return convert.hex.rgb( colorSpec.slice( 1 ) );
    } else if ( /[0-9a-f]{6,6}/i.test( colorSpec ) ) {
        return convert.hex.rgb( colorSpec );
    } else if ( (m = /(hsl|cmyk)\(.*\)/.exec( color )) && m ) {
        return convert[m[1]].rgb( colorStrict );
    } else if ( (m = /rgba?\((\d+|\d*\.\d+),(\d+|\d*\.\d+),(\d+|\d*\.\d+)(?:,(\d+|\d*\.\d+))?\)/.exec( color )) && m ) {
        const colorValues = m
            .slice(1)
            .filter( cv => cv !== void 0 )
            .map( cv => parseFloat(cv) );
        const scale01 = colorValues.every( cv => cv <= 1 ) && m.slice(1).some( cstr => cstr && cstr.includes('.') );
        if ( scale01 ) {
           return colorValues.map( cv => cv * 255 );
        }
        return colorValues;
    }
    const rgb = convert.keyword.rgb( colorStrict );

    if ( rgb ) {
        return rgb;
    } else if ( supportedColors[color] ) {
        return supportedColors[color];
    }
    throw new Error( `Unsupported color name ${colorSpec}` );  // ATTN: handle this better
}

/**
 * Converts a color specification to an SVG compatible string of the form rgb(r,g,b).
 *
 * @param {string} colorSpec - color specification
 * @returns {string} SVG compatible color string
 */
function svgColor( colorSpec ) {
    if ( !colorSpec ) return colorSpec;
    const blended = blendedColor( colorSpec );
    const [r, g, b] = blended ? blended.rgb : colorAsRGB( colorSpec );
    return `rgb(${r},${g},${b})`;
}

/**
 * Converts a color specification to a LaTeX/TikZ compatible string.
 * Supports tikz blending (e.g., blue!50!green) and where possible
 * preserves human readable forms (e.g., when blended). When necessary,
 * produces RGB specification in the extended xcolor format, which
 * does require xcolor package to be loaded in tex.  This also accepts
 * the full set of color names from svgnames, dvipsnames, and x11names.
 *
 * @param {string} colorSpec - specifies a color: either a color name,
 *     hex color, rgb(r, g, b), rgba(r, g, b, a) with opacity currently ignored,
 *     or a LaTeX/TikZ style blended string (e.g., red!20!blue!30!white).
 *
 * @returns {string} a LaTeX/tikZ compatible color specifier for use in node,
 *     edge specifications, and fill specifications.
 * @throws {Error} if a color name or a component in a blended color is not
 *     a supported color name.
 */
function latexColor( colorSpec ) {
    if ( !colorSpec ) return colorSpec;

    const color = colorSpec.replaceAll( ' ', '' ).toLowerCase();
    if ( supportedColors[color] || blendedColor( color )?.color ) {
        return colorSpec;
    }
    const [r, g, b] = colorAsRGB( colorSpec, false );
    return `{rgb: red, ${r}; green, ${g}; blue, ${b}}`;
}

function blendedColor( colorSpec ) {
    const color = colorSpec.replaceAll( ' ', '' ).toLowerCase();
    // ^-*                                             # Start: Leading complement characters (optional)
    // ([A-Z0-9]+)                                     # a color name
    // (?:!(?:[0-9]+(?:\.[0-9]+)?(?:!([A-Z0-9]+))))*   # Followed by zero or more !number colorname's
    // (?:!([A-Z0-9]+))?$                              # Followed by optional !colorname and end
    const latexForm = /^(-*)([A-Z0-9]+)(?:!(?:[0-9]+(?:\.[0-9]+)?(?:![A-Z0-9]+)))*(?:![A-Z0-9]+)?$/i.exec( color );
    if ( latexForm ) {
        const complement = latexForm[1] ? (latexForm[1].length % 2 === 1) : false;
        const colorNames = [latexForm[2]];
        let mixture = [1];
        let m;
        const colorRegex = /!([0-9]+(?:\.[0-9]+)?)(?:!([a-z0-9]+)|$)/gi;
        colorRegex.lastIndex = latexForm[1].length + latexForm[2].length;

        while ( (m = colorRegex.exec(color)) !== null ) {
            const percentage = parseFloat( m[1] );
            const nextColor = m[2] || 'white';
            mixture = mixture.map( p => p * (100 - percentage)/100 );
            mixture.push( percentage/100 );
            colorNames.push( nextColor );
        }
        if ( colorNames.length > 0 && colorNames.every( name => supportedColors[name]) ) {
            const rgb = colorNames.reduce( ([r, g, b], name, index) => {
                const [cr, cg, cb] = supportedColors[name];
                const p = mixture[index];
                return [r + p * cr, g + p * cg, b + p * cb];
            }, [ 0, 0, 0 ] );
            return { color: colorSpec, names: colorNames, mixture, rgb: complement ? [255 - rgb[0], 255 - rgb[1], 255 - rgb[2]] : rgb };
        }
    }
    return void 0;
}

module.exports = {
    colorAsRGB,
    latexColor,
    svgColor,
    blendedColor
};
