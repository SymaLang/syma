module.exports = grammar({
  name: 'syma',

  extras: $ => [
    /\s/,
    $.comment
  ],

  precedences: $ => [
    [$.var_rest_pattern, $.var_pattern, $.symbol],
  ],

  conflicts: $ => [
    [$.symbol, $.var_pattern],
    [$.symbol, $.var_rest_pattern]
  ],

  rules: {
    source_file: $ => repeat1($.expression),

    expression: $ => choice(
      $.number,
      $.string,
      prec(3, $.var_rest_pattern),  // Highest priority
      prec(2, $.var_pattern),       // Medium priority
      prec(1, $.symbol),            // Lowest priority (catch-all)
      $.brace_call,
      $.function_call
    ),

    // Comments
    comment: $ => token(choice(
      // Semicolon comment
      /;[^\n]*/,
      // Double-slash comment
      /\/\/[^\n]*/,
      // Block comment
      /\/\*([^*]|\*[^\/])*\*\//
    )),

    // Numbers
    number: $ => token(/-?\d+(\.\d+)?/),

    // Strings
    string: $ => seq(
      '"',
      repeat(choice(
        // Escaped sequences
        /\\[nrt"\\]/,
        // Any character except quotes and backslash
        /[^"\\]+/
      )),
      '"'
    ),

    // Variable rest pattern: name... or name___ or just ... or ___
    var_rest_pattern: $ => token(choice(
      '...',   // Just dots (wildcard rest)
      '___',   // Just underscores (wildcard rest)
      /[a-zA-Z][a-zA-Z0-9_]*\.\.\./,  // Name followed by dots
      /[a-zA-Z][a-zA-Z0-9]*___/  // Name followed by exactly three underscores
    )),

    // Variable pattern: name_ or just _
    var_pattern: $ => token(choice(
      '_',  // Just underscore (wildcard)
      /[a-zA-Z][a-zA-Z0-9]*_/  // Name followed by underscore
    )),

    // Regular symbols - match any non-whitespace, non-delimiter characters
    // This matches the original parser behavior
    symbol: $ => token(/[^{}\(\),\s";\n]+/),

    // Brace call syntax: {head arg1 arg2 ...}
    brace_call: $ => seq(
      '{',
      field('head', $.expression),
      field('arguments', repeat($.expression)),
      '}'
    ),

    // Function call syntax: head(arg1, arg2, ...)
    function_call: $ => prec(2, seq(
      field('function', choice(
        $.symbol,
        alias(/[a-zA-Z_][a-zA-Z0-9_]*/, $.symbol)
      )),
      token.immediate('('),
      field('arguments', optional($._argument_list)),
      ')'
    )),

    _argument_list: $ => seq(
      $.expression,
      repeat(seq(',', $.expression))
    )
  }
});