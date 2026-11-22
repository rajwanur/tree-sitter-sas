// Tree-sitter SAS grammar definition
// Architecture:
//   - word: $ => $.identifier enables longest-match reserved-word boundaries so
//     normal identifiers (dow, running_total, src, dbms, LBCAT) are NEVER
//     prefix-split.
//   - Tree-sitter's parse-state-sensitive lexer automatically lexes inactive
//     keywords as plain $.identifier; _assign_lhs_id only aliases DATA-step
//     statement keywords when used as assignment targets.
//   - PROC header options parse structurally via proc_option_key: $.identifier
//     (removing ~550 redundant keyword regexes, shrinking parser.c and WASM).
//   - External scanner (src/scanner.c) handles CARDS/DATALINES, nested /* ... */
//     block comments, atomic format_specifier, and boundary-checked missing_value.

const KEYWORDS = [
  // DATA step & base SAS statements
  'data', 'proc', 'run', 'quit', 'cancel',
  'set', 'merge', 'update', 'modify', 'where', 'also',
  'to', 'by', 'while', 'until',
  'output', 'delete', 'input', 'put', 'infile', 'file',
  'keep', 'drop', 'retain', 'length', 'format', 'informat',
  'label', 'attrib', 'array', 'call', 'return', 'goto',
  'select', 'when', 'otherwise',
  'cards', 'datalines', 'cards4', 'datalines4',
  'rename', 'leave', 'continue', 'stop', 'abort', 'link',
  'of', 'descending', 'notsorted', 'over', 'transcode',
  'declare', 'hash', 'hiter',
  // Global statements
  'libname', 'filename', 'options', 'option', 'ods', 'dm',
  // PROC SQL
  'distinct', 'as', 'from', 'join', 'inner', 'left', 'right', 'full',
  'cross', 'outer', 'on', 'into', 'separated', 'trimmed',
  'group', 'having', 'order', 'calculated', 'asc', 'desc',
  'create', 'table', 'view', 'index', 'insert', 'values',
  'alter', 'describe', 'connect', 'disconnect', 'reset', 'validate',
  'union', 'intersect', 'except', 'all', 'corr',
  'case', 'exists', 'missing', 'null',
  // Structured PROC statement & block keywords
  'tables',
  'column', 'columns', 'define', 'compute', 'endcomp', 'break', 'rbreak',
  'style', 'before', 'after', 'line', 'display', 'analysis', 'across', 'computed',
  'copy', 'out',
  'function', 'subroutine', 'endsub', 'outargs',
  'datasets', 'model', 'statgraph',
  'value', 'invalue', 'picture',
  // Operators & control flow
  'if', 'then', 'else', 'do', 'end',
  'and', 'or', 'not',
  'in', 'between', 'is',
];

const PROC_STATEMENT_KEYWORDS = [
  // Statistical & summary PROCs (MEANS/UNIVARIATE/FREQ/PRINT/TRANSPOSE/TTEST/LIFETEST/REG/etc.)
  'var', 'class', 'freq', 'weight', 'id', 'types', 'ways', 'nway',
  'exact', 'test', 'classlev', 'keylabel', 'sum', 'pageby', 'idlabel',
  'base', 'compare', 'with',
  'datarow', 'getnames', 'guessingrows', 'sheet', 'range', 'putnames',
  'lib', 'kill', 'nolist', 'change', 'repair', 'save', 'contents',
  'force', 'getsort', 'exclude',
  'histogram', 'probplot', 'qqplot', 'cdfplot', 'inset',
  'paired', 'time', 'strata', 'add', 'restrict',
  // Graphics & GTL (GPLOT/SGPLOT/SGPANEL/TEMPLATE)
  'plot', 'plot2', 'symbol', 'axis', 'legend', 'note',
  'scatter', 'series', 'vbar', 'hbar', 'density', 'boxplot', 'reg',
  'band', 'needle', 'refline', 'xaxis', 'yaxis', 'keylegend',
  'step', 'hbox', 'vbox', 'dot', 'highlow', 'dropline', 'text', 'ellipse',
  'loess', 'pbspline', 'panelby', 'colaxis', 'rowaxis',
  'seriesplot', 'scatterplot', 'scatterplotmatrix', 'barchart', 'piechart',
  'referenceline', 'modelband', 'stepplot', 'steplet',
  'begingraph', 'endgraph', 'layout', 'endlayout', 'entry', 'entrytitle', 'entryfootnote',
  'discretelegend', 'continuouslegend', 'mergedlegend', 'dynamic', 'mvar', 'nmvar',
  // Statistical & regression procedure sub-statements (GLM/MIXED/LOGISTIC/RANK/MCMC)
  'means', 'lsmeans', 'units', 'ranks', 'slice', 'contrast', 'estimate',
  'random', 'repeated', 'absorb', 'parms', 'prior', 'bayes', 'effect',
  'store', 'score', 'code',
  // Flag-only PROC statements
  'noprint', 'directory', 'details', 'short',
  'outnoequal', 'outbase', 'outcomp', 'outdif', 'outpercent', 'listall',
];

const MACRO_KEYWORDS = [
  ['macro', '%macro'],
  ['mend', '%mend'],
  ['macro_do', '%do'],
  ['macro_end', '%end'],
  ['macro_to', '%to'],
  ['macro_by', '%by'],
  ['macro_while', '%while'],
  ['macro_until', '%until'],
  ['macro_if', '%if'],
  ['macro_then', '%then'],
  ['macro_else', '%else'],
  ['macro_let', '%let'],
  ['macro_global', '%global'],
  ['macro_local', '%local'],
  ['macro_put', '%put'],
  ['macro_abort', '%abort'],
  ['macro_return', '%return'],
  ['macro_goto', '%goto'],
  ['macro_symdel', '%symdel'],
];

function ciPattern(text) {
  return text
    .split('')
    .map(c => (/[a-zA-Z]/.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c))
    .join('');
}

function ciAlternation(words) {
  return new RegExp(words.map(ciPattern).join('|'));
}

const KEYWORD_SET = new Set(KEYWORDS);
for (const w of PROC_STATEMENT_KEYWORDS) {
  if (KEYWORD_SET.has(w)) {
    throw new Error(`Keyword '${w}' appears in both KEYWORDS and PROC_STATEMENT_KEYWORDS`);
  }
}
const MACRO_MAP = new Map(MACRO_KEYWORDS.map(([id, lit]) => [lit, id]));

function kw($, word) {
  const lower = word.toLowerCase();
  if (lower === 'title') return alias($._kw_title, 'title');
  if (lower === 'footnote') return alias($._kw_footnote, 'footnote');
  if (lower === '%include' || lower === '%inc') return alias($._kw_macro_include, '%include');
  if (MACRO_MAP.has(lower)) {
    return alias($[`_kw_${MACRO_MAP.get(lower)}`], lower);
  }
  if (KEYWORD_SET.has(lower)) {
    return alias($[`_kw_${lower}`], lower);
  }
  throw new Error(`Undeclared keyword in grammar.js: ${word}`);
}

function sep1(sep, rule) {
  return seq(rule, repeat(seq(sep, rule)));
}

function dataBaseStatementRules($) {
  return [
    $.set_statement,
    $.merge_statement,
    $.update_statement,
    $.modify_statement,
    $.where_statement,
    $.if_statement,
    $.do_block,
    $.assignment_statement,
    $.output_statement,
    $.delete_statement,
    $.rename_statement,
    $.leave_statement,
    $.continue_statement,
    $.stop_statement,
    $.abort_statement,
    $.link_statement,
    $.dm_statement,
    $.input_statement,
    $.put_statement,
    $.infile_statement,
    $.file_statement,
    $.keep_statement,
    $.drop_statement,
    $.retain_statement,
    $.length_statement,
    $.format_statement,
    $.informat_statement,
    $.label_statement,
    $.attrib_statement,
    $.array_statement,
    $.hash_declaration_statement,
    $.by_statement,
    $.call_statement,
    $.return_statement,
    $.goto_statement,
    $.select_statement,
    $.ods_statement,
    $.options_statement,
    $.title_statement,
    $.footnote_statement,
    $.line_comment,
    $.sum_statement,
    $.expression_statement,
    $.report_line_statement,
    $.bare_statement,
  ];
}

function buildKeywordRules() {
  const out = {};
  for (const w of KEYWORDS) {
    out[`_kw_${w}`] = () => new RegExp(ciPattern(w));
  }
  for (const [id, lit] of MACRO_KEYWORDS) {
    out[`_kw_${id}`] = () => new RegExp(ciPattern(lit));
  }
  out._kw_title = () => /[tT][iI][tT][lL][eE][0-9]*/;
  out._kw_footnote = () => /[fF][oO][oO][tT][nN][oO][tT][eE][0-9]*/;
  out._kw_macro_include = () => /%[iI][nN][cC]([lL][uU][dD][eE])?/;
  return out;
}

module.exports = grammar({
  name: 'sas',

  word: $ => $.identifier,

  extras: $ => [
    /\s/,
    $.block_comment,
    $.macro_comment,
    $.separator_comment,
  ],

  externals: $ => [
    $._cards_block,
    $._cards4_block,
    $.block_comment,
    $.format_specifier,
    $.missing_value,
    $._error_sentinel,
  ],

  conflicts: $ => [
    [$.if_statement, $.if_statement],
    [$.macro_if_statement, $.macro_if_statement],
    [$._data_macro_if_statement, $._data_macro_if_statement],
    [$._proc_macro_if_statement, $._proc_macro_if_statement],
    [$.assignment_statement, $.bare_statement],
    [$._assign_lhs_id, $.bare_statement, $.method_call],
    [$._assign_lhs_id, $.bare_statement, $.dotted_identifier, $.method_call],
    [$._assign_lhs_id, $.macro_expression],
    [$.put_statement, $.expression],
    [$.macro_binary_expression],
    [$.binary_expression],
    [$.data_set_option],
    [$._sql_col_defs],
    [$.macro_expression, $.expression],
    [$.macro_expression, $.assignment_statement],
    [$.in_list, $.parenthesized_expression],
    [$.proc_option, $.parenthesized_expression],
    [$.proc_option_args, $._func_parens],
    [$.proc_select_statement, $.expression],
    [$.model_option, $.expression],
  ],

  supertypes: $ => [
    $.statement,
    $.expression,
  ],

  inline: $ => [
    $.sql_select_item,
  ],

  rules: {
    // ========================================================================
    // Top-level structure
    // ========================================================================

    source_file: $ => repeat($._top_level_item),

    _top_level_item: $ => choice(
      $.data_step,
      $.proc_step,
      $.macro_definition,
      $.global_statement,
      $.macro_let_statement,
      $.macro_global_statement,
      $.macro_local_statement,
      $.macro_symdel_statement,
      $.macro_call_statement,
      $.macro_put_statement,
      $.macro_abort_statement,
      $.run_statement,
      $.quit_statement,
      $.line_comment,
      $.null_statement,
    ),

    // ========================================================================
    // Case-insensitive keyword rules (declared BEFORE identifier & macro_call_name
    // at equal lexical precedence 0 so longest-match ALWAYS prevents prefix
    // splitting like end_var/endlayout/%do_analysis, while exact keywords win ties).
    // ========================================================================
    ...buildKeywordRules(),
    proc_statement_keyword: $ => ciAlternation(PROC_STATEMENT_KEYWORDS),
    _comp_word_op: $ => /[eE][qQ]|[nN][eE]|[gG][tT]|[lL][tT]|[gG][eE]|[lL][eE]|[cC][oO][nN][tT][aA][iI][nN][sS]|[lL][iI][kK][eE]/,
    _macro_sysfunc_name: $ => /%[qQ]?[sS][yY][sS][fF][uU][nN][cC]/,
    _macro_eval_func_name: $ => /%([eE][vV][aA][lL]|[sS][yY][sS][eE][vV][aA][lL][fF])/,
    _macro_builtin_func_name: $ => /%([qQ]?([sS][cC][aA][nN]|[sS][uU][bB][sS][tT][rR]|[uU][pP][cC][aA][sS][eE]|[lL][oO][wW][cC][aA][sS][eE]|[cC][mM][pP][rR][eE][sS]|[lL][eE][fF][tT]|[tT][rR][iI][mM])|[lL][eE][nN][gG][tT][hH]|[iI][nN][dD][eE][xX]|[sS][yY][mM][gG][eE][tT]|[sS][yY][mM][eE][xX][iI][sS][tT]|[sS][yY][sS][mM][aA][cC][eE][xX][iI][sS][tT]|[sS][yY][sS][gG][eE][tT]|[sS][uU][pP][eE][rR][qQ]|[dD][aA][tT][aA][tT][yY][pP]|[vV][eE][rR][iI][fF][yY])/,
    _macro_quote_func_name: $ => /%(([nN][rR])?([sS][tT][rR]|[bB]?[qQ][uU][oO][tT][eE])|[uU][nN][qQ][uU][oO][tT][eE])/,

    // Pure SAS identifier (no leading $ so length x $1 and input x $1-300 tokenize cleanly).
    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    // Allow DATA-step statement keywords as assignment targets (e.g. `format = ...;`,
    // `length = 1;`, `title = 'x';`) without adding keyword shifts globally.
    _assign_lhs_id: $ => choice(
      $.identifier,
      alias(choice(
        $._kw_format, $._kw_informat, $._kw_label, $._kw_length,
        $._kw_input, $._kw_put, $._kw_output, $._kw_file,
        $._kw_return, $._kw_select, $._kw_where, $._kw_set,
        $._kw_update, $._kw_delete, $._kw_keep, $._kw_drop,
        $._kw_retain, $._kw_rename, $._kw_line, $._kw_title,
        $._kw_options, $._kw_option, $._kw_by, $._kw_stop,
      ), $.identifier),
    ),

    // ========================================================================
    // DATA step
    // ========================================================================

    data_step: $ => prec.right(seq(
      kw($, 'data'),
      repeat1(seq(
        field('name', $.data_name),
        repeat(field('option', $.data_set_option)),
      )),
      optional(seq('/', repeat1(choice(
        seq($.identifier, '=', $.expression),
        $.identifier,
      )))),
      ';',
      repeat(choice(
        $.statement,
        $.cards_statement,
        $.cards4_statement,
        $.null_statement,
      )),
      optional(prec(1, seq(
        kw($, 'run'),
        optional(choice(kw($, 'cancel'), kw($, 'quit'))),
        ';',
      ))),
    )),

    _data_atom: $ => choice(
      $.macro_compound_name,
      $.identifier,
      $.name_literal,
      $.macro_variable_reference,
    ),

    data_name: $ => choice(
      seq(field('library', $._data_atom), '.', field('dataset', $._data_atom)),
      $._data_atom,
    ),

    data_set_option_key: $ => $.identifier,

    data_set_option: $ => seq(
      '(',
      repeat1(choice(
        seq(
          $.data_set_option_key,
          optional(choice(
            seq('=', '(', repeat1(choice(
              $.var_range,
              $.prefix_list,
              $.expression,
            )), ')'),
            seq('=', repeat1(choice(
              $.var_range,
              $.prefix_list,
              $.dotted_identifier,
              $.macro_compound_name,
              $.macro_variable_reference,
              $.identifier,
              $.name_literal,
              $.quoted_string,
              $.date_literal,
              $.time_literal,
              $.datetime_literal,
              $.hex_literal,
              $.number,
              seq('-', $.number),
              $.missing_value,
              $.format_specifier,
            ))),
          )),
        ),
        $.var_range,
        $.prefix_list,
      )),
      ')',
    ),

    // ========================================================================
    // PROC step
    // ========================================================================

    proc_step: $ => $.proc_generic_step,

    _proc_datasets_tail: $ => prec.right(seq(
      ';',
      repeat(seq(
        optional(field('body', alias($._datasets_body, $.proc_body))),
        kw($, 'run'),
        optional(kw($, 'cancel')),
        ';',
      )),
      optional(field('body', alias($._datasets_body, $.proc_body))),
      optional(seq(kw($, 'quit'), optional(kw($, 'cancel')), ';')),
    )),

    _proc_std_tail: $ => prec.right(seq(
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(
          kw($, 'run'),
          optional(kw($, 'cancel')),
          ';',
          optional(seq(kw($, 'quit'), optional(kw($, 'cancel')), ';')),
        ),
        seq(kw($, 'quit'), optional(kw($, 'cancel')), ';'),
      )),
    )),

    proc_generic_step: $ => choice(
      // Interactive multi-RUN PROCs (PROC DATASETS): allow multiple RUN groups before QUIT
      prec.right(1, seq(
        kw($, 'proc'),
        field('name', alias($._kw_datasets, $.proc_name)),
        optional(field('options', $.proc_options)),
        $._proc_datasets_tail,
      )),
      // Standard PROC step: header ; [body] [run; [quit;] | quit;]
      prec.right(seq(
        kw($, 'proc'),
        field('name', $.proc_name),
        optional(field('options', $.proc_options)),
        $._proc_std_tail,
      )),
    ),

    proc_name: $ => $.identifier,

    proc_options: $ => repeat1(choice(
      $.proc_option,
      $.proc_option_flag,
    )),

    proc_option: $ => prec(1, seq(
      $.proc_option_key,
      optional($.proc_option_args),
      '=',
      choice(
        $.catalog_path,
        $.format_specifier,
        prec(2, seq($.identifier, $.proc_option_args)),
        seq('(', repeat1($.expression), ')'),
        $.expression,
      ),
      optional($.data_set_option),
    )),

    proc_option_flag: $ => seq(
      $.proc_option_key,
      optional($.proc_option_args),
    ),

    proc_option_key: $ => $.identifier,

    catalog_path: $ => prec(2, seq(
      $.identifier, '.', $.identifier, '.', $.identifier,
    )),

    proc_option_args: $ => seq(
      '(',
      repeat1($.expression),
      ')',
    ),

    _datasets_body: $ => prec.right(repeat1(choice(
      $.proc_statement,
      $.proc_select_statement,
      $.copy_statement,
      $.delete_statement,
      $.datasets_modify_statement,
      $.format_statement,
      $.label_statement,
      $.attrib_statement,
      alias($._simple_macro_statement, $.macro_statement),
      $.line_comment,
      $.null_statement,
      $.bare_statement,
    ))),

    proc_body: $ => prec.right(repeat1($._proc_body_item)),

    _proc_body_item: $ => choice(
      // PROC SQL statements
      $.sql_select_statement,
      $.sql_create_table,
      $.sql_create_view,
      $.sql_drop_statement,
      $.sql_insert_into,
      $.sql_delete_statement,
      $.sql_update_statement,
      $.sql_alter_table,
      $.sql_describe_statement,
      $.sql_connect_statement,
      $.sql_disconnect,
      $.sql_reset,
      $.sql_validate,
      // Structured PROC statements
      $.freq_tables_statement,
      $.model_statement,
      $.proc_output_statement,
      $.proc_select_statement,
      $.copy_statement,
      $.delete_statement,
      // PROC REPORT
      $.report_column_statement,
      $.report_define_statement,
      $.report_compute_statement,
      $.report_break_statement,
      $.report_rbreak_statement,
      $.report_line_statement,
      // PROC FCMP
      $.fcmp_function_block,
      $.fcmp_subroutine_block,
      // PROC TEMPLATE / GTL
      $.gtl_define_block,
      // PROC FORMAT
      $.format_value_statement,
      // Base SAS statements valid inside PROC bodies
      $.by_statement,
      $.where_statement,
      $.format_statement,
      $.informat_statement,
      $.label_statement,
      $.attrib_statement,
      $.title_statement,
      $.footnote_statement,
      // Unified single-line PROC statements (MEANS/FREQ/TABULATE/PRINT/COMPARE/DATASETS/IMPORT/EXPORT/SGPLOT/GTL/etc.)
      $.proc_statement,
      // Macro statements & comments inside PROC bodies
      alias($._proc_macro_statement, $.macro_statement),
      $.line_comment,
      $.null_statement,
      // Generic fallback for unrecognized PROC sub-statements
      $.bare_statement,
    ),

    // ========================================================================
    // Standalone step terminators & null statement
    // ========================================================================

    run_statement: $ => seq(kw($, 'run'), optional(kw($, 'cancel')), ';'),
    quit_statement: $ => seq(kw($, 'quit'), optional(kw($, 'cancel')), ';'),
    null_statement: $ => ';',

    // ========================================================================
    // Macro language (supports DATA/PROC/global steps inside macro bodies!)
    // ========================================================================

    macro_call_name: $ => /%[a-zA-Z_][a-zA-Z0-9_]*/,

    _base_statement: $ => choice(...dataBaseStatementRules($)),

    _macro_body_item: $ => choice(
      $.data_step,
      $.proc_step,
      $.libname_statement,
      $.filename_statement,
      $.x_statement,
      alias($._step_macro_statement, $.macro_statement),
      $._base_statement,
      $.run_statement,
      $.quit_statement,
      $.null_statement,
    ),

    _macro_def_options: $ => seq('/', repeat1(choice(
      seq($.identifier, '=', choice($.quoted_string, $.number, $.identifier)),
      $.identifier,
    ))),

    macro_definition: $ => seq(
      kw($, '%macro'),
      field('name', $.identifier),
      optional(field('params', $.macro_parameters)),
      optional($._macro_def_options),
      ';',
      repeat($._macro_body_item),
      optional(choice($.macro_variable_reference, $.macro_compound_name, $.number, $.quoted_string)),
      kw($, '%mend'),
      optional(field('name', $.identifier)),
      ';',
    ),

    macro_parameters: $ => seq(
      '(',
      optional(sep1(',', $.macro_parameter)),
      ')',
    ),

    macro_parameter: $ => seq(
      field('name', $.identifier),
      optional(seq('=', optional(field('default', $.macro_parameter_default)))),
    ),

    macro_parameter_default: $ => $.macro_param_value,

    _macro_param_atom: $ => choice(
      $.macro_compound_name,
      $.macro_variable_reference,
      $.macro_function_call,
      $.macro_quoting_function,
      seq($.macro_call_name, '(', optional($._macro_func_arg_list), ')'),
      $.quoted_string,
      $.format_specifier,
      $.missing_value,
      $.number,
      $.identifier,
      seq('(', repeat(choice($._macro_param_atom, '=', ',')), ')'),
      '/',
      $.macro_param_punct,
    ),

    macro_param_punct: $ => token(prec(-2, /[^a-zA-Z0-9_\s;"'&%,()=\/]+/)),

    macro_param_text: $ => prec.right(repeat1($._macro_param_atom)),

    macro_param_value: $ => prec.right(repeat1(choice($._macro_param_atom, '='))),

    _macro_call_arg_pair: $ => seq(
      $.identifier,
      '=',
      optional($.macro_param_value),
    ),

    _macro_call_arg: $ => choice(
      $._macro_call_arg_pair,
      $.macro_param_text,
    ),

    _macro_call_arg_list: $ => choice(
      seq($._macro_call_arg, repeat(seq(',', optional($._macro_call_arg)))),
      repeat1(seq(',', optional($._macro_call_arg))),
    ),

    _macro_func_arg_list: $ => choice(
      seq($.macro_param_value, repeat(seq(',', optional($.macro_param_value)))),
      repeat1(seq(',', optional($.macro_param_value))),
    ),

    _macro_call_parens: $ => prec.right(seq(
      '(',
      optional($._macro_call_arg_list),
      ')',
      optional(';'),
    )),

    macro_call_statement: $ => seq(
      field('name', $.macro_call_name),
      choice(
        $._macro_call_parens,
        ';',
      ),
    ),

    macro_label_statement: $ => seq(
      field('name', $.macro_call_name),
      ':',
    ),

    _macro_put_tail: $ => seq(
      optional($.macro_text),
      ';',
    ),

    macro_put_statement: $ => seq(
      kw($, '%put'),
      $._macro_put_tail,
    ),

    _macro_abort_tail: $ => seq(
      repeat(choice($.identifier, $.number, $.macro_variable_reference, seq($.identifier, '=', $.macro_expression))),
      ';',
    ),

    macro_abort_statement: $ => seq(
      kw($, '%abort'),
      $._macro_abort_tail,
    ),

    macro_return_statement: $ => seq(kw($, '%return'), ';'),

    macro_goto_statement: $ => seq(kw($, '%goto'), $.identifier, ';'),

    _symdel_args: $ => seq(
      repeat1($.identifier),
      optional(seq('/', repeat1($.identifier))),
      ';',
    ),

    macro_symdel_statement: $ => seq(
      kw($, '%symdel'),
      $._symdel_args,
    ),

    _inline_macro_stmt: $ => choice(
      $.macro_let_statement,
      $.macro_local_statement,
      $.macro_call_statement,
      $.macro_put_statement,
    ),

    _simple_macro_statement: $ => choice(
      $.macro_let_statement,
      $.macro_global_statement,
      $.macro_local_statement,
      $.macro_symdel_statement,
      $.macro_call_statement,
      $.macro_put_statement,
      $.macro_abort_statement,
      $.macro_return_statement,
      $.macro_goto_statement,
      $.macro_label_statement,
      $.include_statement,
    ),

    _step_macro_statement: $ => choice(
      $.macro_definition,
      $.macro_do_block,
      $.macro_if_statement,
      $.macro_function_call,
      $.macro_quoting_function,
      $._simple_macro_statement,
    ),

    macro_statement: $ => choice(
      $._simple_macro_statement,
      alias($._data_macro_do_block, $.macro_do_block),
      alias($._data_macro_if_statement, $.macro_if_statement),
    ),

    _proc_macro_statement: $ => choice(
      $._simple_macro_statement,
      alias($._proc_macro_do_block, $.macro_do_block),
      alias($._proc_macro_if_statement, $.macro_if_statement),
    ),

    _macro_do_header: $ => choice(
      seq(kw($, '%while'), '(', $.macro_expression, ')', ';'),
      seq(kw($, '%until'), '(', $.macro_expression, ')', ';'),
      seq($.identifier, '=', $.macro_expression, kw($, '%to'), $.macro_expression, optional(seq(kw($, '%by'), $.macro_expression)), ';'),
      ';',
    ),

    macro_do_block: $ => seq(
      kw($, '%do'),
      $._macro_do_header,
      repeat($._macro_body_item),
      kw($, '%end'),
      ';',
    ),

    _data_macro_do_block: $ => seq(
      kw($, '%do'),
      $._macro_do_header,
      repeat(choice($.statement, $.null_statement)),
      kw($, '%end'),
      ';',
    ),

    _proc_macro_do_block: $ => seq(
      kw($, '%do'),
      $._macro_do_header,
      repeat($._proc_body_item),
      kw($, '%end'),
      ';',
    ),

    _macro_if_branch: $ => choice(
      $._macro_body_item,
      alias($._macro_value_statement, $.expression_statement),
    ),

    _data_macro_if_branch: $ => choice(
      $.statement,
      alias($._macro_value_statement, $.expression_statement),
    ),

    _proc_macro_if_branch: $ => $._proc_body_item,

    macro_if_statement: $ => seq(
      kw($, '%if'),
      field('condition', $.macro_expression),
      kw($, '%then'),
      $._macro_if_branch,
      optional(seq(
        kw($, '%else'),
        $._macro_if_branch,
      )),
    ),

    _data_macro_if_statement: $ => seq(
      kw($, '%if'),
      field('condition', $.macro_expression),
      kw($, '%then'),
      $._data_macro_if_branch,
      optional(seq(
        kw($, '%else'),
        $._data_macro_if_branch,
      )),
    ),

    _proc_macro_if_statement: $ => seq(
      kw($, '%if'),
      field('condition', $.macro_expression),
      kw($, '%then'),
      $._proc_macro_if_branch,
      optional(seq(
        kw($, '%else'),
        $._proc_macro_if_branch,
      )),
    ),

    _macro_let_tail: $ => seq(
      '=',
      optional(field('value', $.macro_text)),
      ';',
    ),

    macro_let_statement: $ => seq(
      kw($, '%let'),
      field('name', $.identifier),
      $._macro_let_tail,
    ),

    macro_text: $ => prec.right(repeat1(choice(
      $.macro_variable_reference,
      $.macro_function_call,
      $.macro_quoting_function,
      seq($.macro_call_name, '(', optional($._macro_func_arg_list), ')'),
      $.quoted_string,
      '/',
      $.macro_text_token,
      token(prec(-2, /[&%]/)),
    ))),

    macro_text_token: $ => token(prec(-2, /[^;"'&%\/]+/)),

    macro_global_statement: $ => seq(
      kw($, '%global'),
      repeat1($.identifier),
      ';',
    ),

    macro_local_statement: $ => seq(
      kw($, '%local'),
      repeat1($.identifier),
      ';',
    ),

    macro_expression: $ => choice(
      $.macro_binary_expression,
      $.macro_function_call,
      $.macro_quoting_function,
      $.macro_compound_name,
      $.macro_variable_reference,
      seq($.macro_call_name, optional(seq('(', optional($._macro_call_arg_list), ')'))),
      $.dotted_identifier,
      seq('(', $.macro_expression, ')'),
      $.format_specifier,
      $.identifier,
      $.quoted_string,
      $.missing_value,
      $.number,
    ),

    _comp_sym_op: $ => /\^=:|~=:|<=:|>=:|<:|>:|=:|\^=|~=|<=|>=|<|>/,

    macro_binary_expression: $ => choice(
      prec.left(1, seq(field('left', $.macro_expression), field('operator', choice('=', alias($._comp_sym_op, $.comparison_operator), alias($._comp_word_op, $.comparison_operator))), field('right', $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', choice('=', alias($._comp_sym_op, $.comparison_operator), alias($._comp_word_op, $.comparison_operator))))),
      prec.left(2, seq(field('left', $.macro_expression), field('operator', choice('||', '!!')), field('right', $.macro_expression))),
      prec.left(3, seq(field('left', $.macro_expression), field('operator', '+'), field('right', $.macro_expression))),
      prec.left(3, seq(field('left', $.macro_expression), field('operator', '-'), field('right', $.macro_expression))),
      prec.left(4, seq(field('left', $.macro_expression), field('operator', '*'), field('right', $.macro_expression))),
      prec.left(4, seq(field('left', $.macro_expression), field('operator', '/'), field('right', $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', kw($, 'and')), field('right', $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', kw($, 'or')), field('right', $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', kw($, 'in')), choice($.in_list, $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', kw($, 'not')), field('right', $.macro_expression))),
      prec(2, seq(field('operator', kw($, 'not')), field('operand', $.macro_expression))),
    ),

    // %sysfunc / %qsysfunc inner SAS function call allowing unquoted macro text args
    // (e.g. %sysfunc(ifc(&&cat_&i = Obese, High Risk, Standard))).
    _macro_sysfunc_inner_call: $ => seq(
      field('name', choice($.identifier, $.macro_variable_reference)),
      '(',
      optional($._macro_func_arg_list),
      ')',
    ),

    _sysfunc_parens: $ => seq(
      '(',
      optional(seq(
        alias($._macro_sysfunc_inner_call, $.function_call),
        optional(seq(',', $.macro_expression)),
      )),
      ')',
    ),

    _eval_parens: $ => seq(
      '(',
      optional($.macro_expression),
      ')',
    ),

    _builtin_parens: $ => seq(
      '(',
      optional($._macro_func_arg_list),
      ')',
    ),

    _quote_parens: $ => seq(
      '(',
      optional($.macro_quoted_text),
      ')',
    ),

    macro_function_call: $ => choice(
      seq(
        field('name', alias($._macro_sysfunc_name, $.macro_function_name)),
        $._sysfunc_parens,
      ),
      seq(
        field('name', alias($._macro_eval_func_name, $.macro_function_name)),
        $._eval_parens,
      ),
      seq(
        field('name', alias($._macro_builtin_func_name, $.macro_function_name)),
        $._builtin_parens,
      ),
    ),

    macro_quoting_function: $ => seq(
      field('name', alias($._macro_quote_func_name, $.macro_function_name)),
      $._quote_parens,
    ),

    macro_quoted_text: $ => prec.right(repeat1(choice(
      $.macro_variable_reference,
      $.macro_function_call,
      $.macro_quoting_function,
      $.quoted_string,
      seq('(', optional($.macro_quoted_text), ')'),
      token(/%['"]/),
      $.macro_quoted_text_token,
      token(prec(-2, /%[a-zA-Z_][a-zA-Z0-9_]*/)),
      token(prec(-3, /[&%]/)),
    ))),

    macro_quoted_text_token: $ => /[^()'"&%]+/,

    // ========================================================================
    // Compound macro names, variable ranges, and prefix lists
    // ========================================================================

    _macro_immediate_var: $ => seq(
      token.immediate(prec(2, /&+/)),
      field('name', $.identifier),
      optional(token.immediate(prec(2, '.'))),
    ),

    macro_compound_name: $ => prec.left(2, seq(
      choice($.identifier, $.macro_variable_reference),
      repeat1(choice(
        alias($._macro_immediate_var, $.macro_variable_reference),
        token.immediate(prec(2, /[a-zA-Z0-9_]+/)),
      )),
    )),

    prefix_list: $ => prec(1, seq(
      $.identifier,
      token.immediate(':'),
    )),

    var_range: $ => prec(2, seq(
      choice($.macro_compound_name, $.identifier),
      '-',
      choice($.macro_compound_name, $.identifier),
    )),

    // ========================================================================
    // Statement supertype
    // ========================================================================

    statement: $ => choice(
      ...dataBaseStatementRules($),
      $.macro_statement,
    ),

    // ========================================================================
    // DATA step & shared SAS statements
    // ========================================================================

    _set_macro_if: $ => seq(
      kw($, '%if'),
      $.macro_expression,
      kw($, '%then'),
      choice(
        seq(kw($, '%do'), ';', repeat(choice($.data_reference, alias($._inline_macro_stmt, $.macro_statement))), kw($, '%end'), ';'),
        $.data_reference,
      ),
      optional(seq(
        kw($, '%else'),
        choice(
          seq(kw($, '%do'), ';', repeat(choice($.data_reference, alias($._inline_macro_stmt, $.macro_statement))), kw($, '%end'), ';'),
          $.data_reference,
        ),
      )),
    ),

    _set_macro_do: $ => seq(
      kw($, '%do'),
      $._macro_do_header,
      repeat(choice($.data_reference, alias($._inline_macro_stmt, $.macro_statement))),
      kw($, '%end'),
      ';',
    ),

    _set_body_tail: $ => seq(
      repeat1(choice($.data_reference, alias($._set_macro_do, $.macro_do_block), alias($._set_macro_if, $.macro_if_statement))),
      repeat($.set_statement_option),
      ';',
    ),

    set_statement: $ => seq(kw($, 'set'), $._set_body_tail),
    merge_statement: $ => seq(kw($, 'merge'), $._set_body_tail),
    update_statement: $ => seq(kw($, 'update'), repeat1($.data_reference), repeat($.set_statement_option), ';'),
    modify_statement: $ => seq(kw($, 'modify'), repeat1($.data_reference), repeat($.set_statement_option), ';'),

    set_statement_option: $ => seq($.identifier, '=', choice($.identifier, $.macro_variable_reference, $.number)),

    data_reference: $ => seq(
      $._data_atom,
      optional(seq('.', $._data_atom)),
      optional($.data_set_option),
    ),

    _where_tail: $ => seq(optional(kw($, 'also')), $.expression, ';'),

    where_statement: $ => prec(2, seq(kw($, 'where'), $._where_tail)),

    if_statement: $ => choice(
      seq(
        kw($, 'if'),
        field('condition', $.expression),
        kw($, 'then'),
        field('consequence', $.statement),
        optional(seq(
          repeat($.line_comment),
          kw($, 'else'),
          field('alternative', $.statement),
        )),
      ),
      // Subsetting IF: if <condition>;
      seq(
        kw($, 'if'),
        field('condition', $.expression),
        ';',
      ),
    ),

    _do_spec: $ => seq(
      $.expression,
      optional(seq(kw($, 'to'), $.expression, optional(seq(kw($, 'by'), $.expression)))),
      optional(choice(
        seq(kw($, 'while'), '(', $.expression, ')'),
        seq(kw($, 'until'), '(', $.expression, ')'),
      )),
    ),

    _do_header: $ => seq(
      optional(choice(
        seq(kw($, 'while'), '(', $.expression, ')'),
        seq(kw($, 'until'), '(', $.expression, ')'),
        seq(kw($, 'over'), $.identifier),
        seq($.identifier, '=', sep1(',', $._do_spec)),
      )),
      ';',
    ),

    do_block: $ => seq(
      kw($, 'do'),
      $._do_header,
      repeat(choice($.statement, $.null_statement)),
      kw($, 'end'),
      ';',
    ),

    _assign_subscript: $ => prec(1, seq(choice('[', '{'), sep1(',', $.expression), choice(']', '}'))),

    _assign_rhs: $ => prec(1, seq('=', field('value', $.expression), ';')),

    assignment_statement: $ => seq(
      field('target', choice($.macro_compound_name, $._assign_lhs_id, $.name_literal, $.macro_variable_reference)),
      optional(choice(
        seq('.', $.identifier),
        $._assign_subscript,
      )),
      $._assign_rhs,
    ),

    expression_statement: $ => seq(choice($.method_call, $.macro_variable_reference, $.macro_compound_name), ';'),

    _macro_value_expr: $ => prec(-1, choice(
      $.macro_binary_expression,
      $.macro_function_call,
      $.macro_quoting_function,
      $.macro_compound_name,
      $.macro_variable_reference,
      $.dotted_identifier,
      seq('(', $.macro_expression, ')'),
      $.format_specifier,
      $.identifier,
      $.quoted_string,
      $.missing_value,
      $.number,
    )),

    _macro_value_statement: $ => prec(-1, seq(
      alias($._macro_value_expr, $.macro_expression),
      ';',
    )),

    output_statement: $ => seq(kw($, 'output'), optional($.data_reference), ';'),

    _delete_tail: $ => seq(
      repeat(choice($.prefix_list, $.macro_compound_name, $.identifier, $.macro_variable_reference)),
      optional($._class_slash_options),
      ';',
    ),

    delete_statement: $ => prec(2, seq(
      kw($, 'delete'),
      $._delete_tail,
    )),

    rename_statement: $ => seq(
      kw($, 'rename'),
      repeat1(seq($.identifier, '=', $.identifier)),
      ';',
    ),

    leave_statement: $ => seq(kw($, 'leave'), ';'),
    continue_statement: $ => seq(kw($, 'continue'), ';'),
    stop_statement: $ => seq(kw($, 'stop'), ';'),
    abort_statement: $ => seq(
      kw($, 'abort'),
      repeat(choice($.identifier, $.number)),
      ';',
    ),
    link_statement: $ => seq(kw($, 'link'), $.identifier, ';'),
    dm_statement: $ => seq(
      kw($, 'dm'),
      repeat1(choice($.quoted_string, $.identifier, $.macro_variable_reference)),
      ';',
    ),

    input_statement: $ => prec(2, seq(
      kw($, 'input'),
      repeat(choice(
        seq('@', choice($.number, $.identifier, $.macro_variable_reference)),
        seq('+', choice($.number, $.identifier, $.macro_variable_reference)),
        seq('#', $.number),
        '@@',
        '@',
        '/',
        // Variable with column range: name [$] start[-end]  (e.g. input var $1-300;)
        seq(choice($.identifier, $.name_literal, $.macro_variable_reference), optional('$'), $.number, '-', $.number),
        // Variable with bare $ [width]: name $ [width]
        seq(choice($.identifier, $.name_literal, $.macro_variable_reference), '$', optional($.number)),
        // Variable with format/informat: name [:] [$] format_specifier|number
        seq(choice($.identifier, $.name_literal, $.macro_variable_reference), optional(':'), optional('$'), choice($.format_specifier, $.number)),
        // Bare variable name
        choice($.identifier, $.name_literal, $.macro_variable_reference),
        // Standalone format specifier
        $.format_specifier,
      )),
      ';',
    )),

    put_statement: $ => prec(2, seq(
      kw($, 'put'),
      repeat(choice(
        seq('@', choice($.number, $.identifier, $.macro_variable_reference)),
        seq('#', $.number),
        '@@',
        '@',
        '/',
        seq($.identifier, '=', optional(choice($.format_specifier, $.number))),
        seq($.array_element, '=', optional(choice($.format_specifier, $.number))),
        $.format_specifier,
        $.expression,
      )),
      ';',
    )),

    infile_statement: $ => seq(
      kw($, 'infile'),
      choice(
        $.identifier,
        $.quoted_string,
        $.macro_variable_reference,
      ),
      repeat(choice($.proc_option, $.proc_option_flag)),
      ';',
    ),

    file_statement: $ => seq(
      kw($, 'file'),
      choice($.identifier, $.quoted_string, $.macro_variable_reference),
      repeat(choice($.proc_option, $.proc_option_flag)),
      ';',
    ),

    sum_statement: $ => prec(1, seq(
      field('target', $.identifier),
      '+',
      field('value', $.expression),
      ';',
    )),

    keep_statement: $ => seq(
      kw($, 'keep'),
      repeat1(choice($.var_range, $.prefix_list, $.macro_compound_name, $.identifier, $.name_literal, $.macro_variable_reference)),
      ';',
    ),

    drop_statement: $ => seq(
      kw($, 'drop'),
      repeat1(choice($.var_range, $.prefix_list, $.macro_compound_name, $.identifier, $.name_literal, $.macro_variable_reference)),
      ';',
    ),

    retain_statement: $ => seq(
      kw($, 'retain'),
      repeat1(seq(choice($.var_range, $.identifier, $.name_literal, $.macro_variable_reference), optional($.expression))),
      ';',
    ),

    length_statement: $ => seq(
      kw($, 'length'),
      repeat1(seq(
        field('name', choice($.identifier, $.name_literal, $.macro_variable_reference)),
        optional(choice(
          $.format_specifier,
          seq(optional('$'), $.number),
        )),
      )),
      ';',
    ),

    format_statement: $ => seq(
      kw($, 'format'),
      repeat1(choice($.var_range, $.prefix_list, $.format_specifier, $.number, $.identifier, $.name_literal, $.macro_variable_reference)),
      ';',
    ),

    informat_statement: $ => seq(
      kw($, 'informat'),
      repeat1(choice($.var_range, $.prefix_list, $.format_specifier, $.number, $.identifier, $.name_literal, $.macro_variable_reference)),
      ';',
    ),

    label_statement: $ => seq(
      kw($, 'label'),
      repeat1(seq(choice($.identifier, $.name_literal, $.macro_variable_reference), '=', $.quoted_string)),
      ';',
    ),

    attrib_statement: $ => seq(
      kw($, 'attrib'),
      repeat1(seq(
        choice($.identifier, $.name_literal, $.macro_variable_reference),
        repeat1(choice(
          seq(kw($, 'format'), '=', choice($.format_specifier, $.number, $.identifier)),
          seq(kw($, 'informat'), '=', choice($.format_specifier, $.number, $.identifier)),
          seq(kw($, 'label'), '=', $.quoted_string),
          seq(kw($, 'length'), '=', choice($.format_specifier, seq(optional('$'), $.number), $.identifier)),
          seq(kw($, 'transcode'), '=', $.identifier),
        )),
      )),
      ';',
    ),

    array_statement: $ => seq(
      kw($, 'array'),
      $.identifier,
      optional($._array_dims),
      $._array_vars,
      optional($._array_init),
      ';',
    ),

    _array_dims: $ => seq(
      choice('[', '{'),
      optional('-'),
      repeat1(choice($.number, $.macro_variable_reference, '*', seq(':', $.number), ',')),
      choice(']', '}'),
    ),

    _array_vars: $ => seq(
      optional(seq('$', optional($.number))),
      repeat1(choice(
        $.var_range,
        $.prefix_list,
        $.identifier,
        $.macro_variable_reference,
      )),
    ),

    _array_init: $ => seq(
      '(',
      repeat(choice(
        $.number,
        $.quoted_string,
        $.date_literal,
        $.time_literal,
        $.datetime_literal,
        $.hex_literal,
        $.missing_value,
        $.identifier,
        $.macro_variable_reference,
        '+', '-', '*', ',',
      )),
      ')',
    ),

    _hash_decl_tail: $ => seq(
      '(',
      repeat(seq(choice(
        seq($.identifier, ':', $.expression),
        $.quoted_string,
        $.identifier,
      ), optional(','))),
      ')',
      ';',
    ),

    hash_declaration_statement: $ => seq(
      kw($, 'declare'),
      choice(kw($, 'hash'), kw($, 'hiter')),
      field('name', $.identifier),
      $._hash_decl_tail,
    ),

    by_statement: $ => seq(
      kw($, 'by'),
      repeat1(seq(optional(kw($, 'descending')), choice($.identifier, $.name_literal, $.macro_variable_reference))),
      optional(kw($, 'notsorted')),
      ';',
    ),

    _call_parens: $ => seq(
      '(',
      optional(sep1(',', $.expression)),
      ')',
      ';',
    ),

    call_statement: $ => seq(
      kw($, 'call'),
      field('name', $.identifier),
      $._call_parens,
    ),

    _return_tail: $ => seq(
      optional(choice(
        seq('(', $.expression, ')'),
        $.identifier,
      )),
      ';',
    ),

    return_statement: $ => prec(2, seq(kw($, 'return'), $._return_tail)),

    goto_statement: $ => seq(kw($, 'goto'), $.identifier, ';'),

    _select_tail: $ => seq(
      optional(seq('(', $.expression, ')')),
      ';',
      repeat(choice($.when_clause, $.otherwise_clause)),
      kw($, 'end'),
      ';',
    ),

    select_statement: $ => prec(2, seq(kw($, 'select'), $._select_tail)),

    _select_body_stmt: $ => choice(
      $._subblock_statement,
      $.output_statement,
      $.delete_statement,
      $.goto_statement,
      $.link_statement,
      $.abort_statement,
      $.stop_statement,
      $.sum_statement,
      $.null_statement,
    ),

    when_clause: $ => seq(
      kw($, 'when'),
      '(',
      sep1(',', $.expression),
      ')',
      $._select_body_stmt,
    ),

    otherwise_clause: $ => seq(
      kw($, 'otherwise'),
      $._select_body_stmt,
    ),

    cards_statement: $ => seq(
      choice(kw($, 'cards'), kw($, 'datalines')),
      ';',
      $._cards_block,
    ),

    cards4_statement: $ => seq(
      choice(kw($, 'cards4'), kw($, 'datalines4')),
      ';',
      $._cards4_block,
    ),

    ods_statement: $ => seq(
      kw($, 'ods'),
      $.identifier,
      repeat(choice(
        $.identifier,
        $.quoted_string,
        $.macro_variable_reference,
        $.number,
        '/', '(', ')', '[', ']', '{', '}', '=', ',', '.', '*', '-', '+',
      )),
      ';',
    ),

    _format_value_entry: $ => seq(
      choice(
        seq(
          choice($.number, $.quoted_string, $.identifier, $.macro_variable_reference),
          '-',
          optional('<'),
          choice($.number, $.quoted_string, $.identifier, $.macro_variable_reference),
        ),
        sep1(',', choice($.number, $.quoted_string, $.identifier, $.macro_variable_reference)),
      ),
      '=',
      choice($.quoted_string, $.number, $.missing_value, $.identifier, $.macro_variable_reference),
      optional(seq('(', repeat1(choice($.identifier, $.quoted_string, $.number, '=')), ')')),
    ),

    _format_macro_do: $ => seq(
      kw($, '%do'),
      $._macro_do_header,
      repeat(choice(
        alias($._inline_macro_stmt, $.macro_statement),
        $._format_value_entry,
      )),
      kw($, '%end'),
      ';',
    ),

    format_value_statement: $ => seq(
      choice(kw($, 'value'), kw($, 'invalue'), kw($, 'picture')),
      optional('$'),
      $.identifier,
      optional(seq('(', repeat1($.identifier), ')')),
      repeat1(choice(
        alias($._inline_macro_stmt, $.macro_statement),
        alias($._format_macro_do, $.macro_do_block),
        $._format_value_entry,
      )),
      ';',
    ),

    // Generic fallback for unrecognized statements (never starts with step/block terminators).
    bare_statement: $ => prec.dynamic(-10, prec(-2, seq(
      choice($.identifier, $.name_literal),
      repeat(choice($.identifier, $.quoted_string, $.macro_variable_reference, $.number, $.format_specifier, '(', ')', '[', ']', '{', '}', '=', ',', '.', '/', ':')),
      ';',
    ))),

    // ========================================================================
    // PROC SQL sub-language rules
    // ========================================================================

    _sql_set_op: $ => seq(
      choice(
        kw($, 'union'),
        kw($, 'intersect'),
        kw($, 'except'),
        seq(kw($, 'outer'), kw($, 'union')),
      ),
      optional(kw($, 'all')),
      optional(kw($, 'corr')),
    ),

    sql_select_statement: $ => seq(
      $._sql_select_query,
      repeat(seq($._sql_set_op, $._sql_select_query)),
      ';',
    ),

    _sql_select_query: $ => seq(
      kw($, 'select'),
      optional(kw($, 'distinct')),
      $.sql_select_list,
      optional($.sql_into_clause),
      optional($.sql_from_clause),
      repeat($.sql_join_clause),
      optional($.sql_where_clause),
      optional($.sql_group_by_clause),
      optional($.sql_having_clause),
      optional($.sql_order_by_clause),
    ),

    sql_into_clause: $ => seq(
      kw($, 'into'),
      sep1(',', seq(
        ':', $.identifier,
        optional(seq('-', ':', $.identifier)),
        optional(kw($, 'trimmed')),
        optional(seq(kw($, 'separated'), kw($, 'by'), $.quoted_string)),
      )),
    ),

    sql_select_list: $ => sep1(',', seq(
      $.sql_select_item,
      optional(seq(kw($, 'as'), $.identifier)),
      repeat(seq($.identifier, '=', choice($.format_specifier, $.expression))),
    )),

    sql_select_item: $ => choice(
      $.sql_qualified_column,
      $.sql_expression,
    ),

    sql_from_clause: $ => seq(
      kw($, 'from'),
      sep1(',', $.sql_table_ref),
    ),

    sql_where_clause: $ => seq(
      kw($, 'where'),
      $.sql_expression,
      repeat($.macro_variable_reference),
    ),

    sql_group_by_clause: $ => seq(
      kw($, 'group'),
      kw($, 'by'),
      sep1(',', seq(optional(kw($, 'calculated')), $.expression)),
    ),

    sql_having_clause: $ => seq(
      kw($, 'having'),
      $.sql_expression,
    ),

    sql_order_by_clause: $ => seq(
      kw($, 'order'),
      kw($, 'by'),
      sep1(',', seq(optional(kw($, 'calculated')), $.expression, optional(choice(kw($, 'asc'), kw($, 'desc'))))),
    ),

    sql_join_clause: $ => seq(
      choice(
        seq(kw($, 'inner'), kw($, 'join')),
        seq(kw($, 'left'), optional(kw($, 'outer')), kw($, 'join')),
        seq(kw($, 'right'), optional(kw($, 'outer')), kw($, 'join')),
        seq(kw($, 'full'), optional(kw($, 'outer')), kw($, 'join')),
        seq(kw($, 'cross'), kw($, 'join')),
        kw($, 'join'),
      ),
      $.sql_table_ref,
      optional(seq(kw($, 'on'), $.expression)),
    ),

    sql_table_ref: $ => choice(
      seq(
        $._data_atom,
        optional(seq('.', $._data_atom)),
        optional(choice(
          seq(kw($, 'as'), $.identifier),
          $.identifier,
        )),
      ),
      seq(
        '(',
        $._sql_select_query,
        ')',
        optional(choice(
          seq(kw($, 'as'), $.identifier),
          $.identifier,
        )),
      ),
    ),

    _sql_create_macro_if_setop: $ => seq(
      kw($, '%if'),
      $.macro_expression,
      kw($, '%then'),
      $._sql_set_op,
      ';',
    ),

    _sql_create_macro_do: $ => seq(
      kw($, '%do'),
      choice(
        seq(kw($, '%while'), '(', $.macro_expression, ')', ';'),
        seq(kw($, '%until'), '(', $.macro_expression, ')', ';'),
        seq($.identifier, '=', $.macro_expression, kw($, '%to'), $.macro_expression, optional(seq(kw($, '%by'), $.macro_expression)), ';'),
        ';',
      ),
      repeat1(choice(
        $._sql_select_query,
        $.macro_let_statement,
        $.macro_local_statement,
        alias($._sql_create_macro_if_setop, $.macro_if_statement),
      )),
      kw($, '%end'),
      ';',
    ),

    _sql_table_name: $ => prec.right(seq($._data_atom, optional(seq('.', $._data_atom)))),

    _sql_set_list: $ => sep1(',', seq($.identifier, '=', $.expression)),

    _sql_values_clause: $ => seq(
      kw($, 'values'),
      repeat1(seq('(', optional(sep1(',', $.expression)), ')')),
    ),

    _sql_col_defs: $ => seq(
      '(',
      repeat(seq(
        $.identifier,
        optional($.identifier),
        optional(seq('(', repeat(choice($.identifier, $.number, ',')), ')')),
        repeat(seq($.identifier, '=', choice($.format_specifier, $.expression))),
        optional(','),
      )),
      ')',
    ),

    sql_create_table: $ => seq(
      kw($, 'create'),
      kw($, 'table'),
      $._sql_table_name,
      choice(
        seq(
          kw($, 'as'),
          choice(
            seq($._sql_select_query, repeat(seq($._sql_set_op, $._sql_select_query))),
            seq(
              choice(alias($._sql_create_macro_do, $.macro_do_block), $.macro_let_statement),
              repeat(choice(
                $._sql_select_query,
                alias($._sql_create_macro_do, $.macro_do_block),
                $.macro_let_statement,
              )),
            ),
          ),
        ),
        $._sql_col_defs,
      ),
      ';',
    ),

    sql_create_view: $ => seq(
      kw($, 'create'),
      kw($, 'view'),
      $._sql_table_name,
      kw($, 'as'),
      $._sql_select_query,
      repeat(seq($._sql_set_op, $._sql_select_query)),
      ';',
    ),

    sql_drop_statement: $ => seq(
      kw($, 'drop'),
      choice(kw($, 'table'), kw($, 'view'), kw($, 'index')),
      sep1(',', $._sql_table_name),
      optional(seq(kw($, 'from'), $._sql_table_name)),
      ';',
    ),

    sql_insert_into: $ => seq(
      kw($, 'insert'),
      kw($, 'into'),
      $._sql_table_name,
      optional(seq('(', sep1(',', $.identifier), ')')),
      choice(
        $._sql_values_clause,
        seq(kw($, 'set'), $._sql_set_list),
        $._sql_select_query,
      ),
      ';',
    ),

    sql_delete_statement: $ => seq(
      kw($, 'delete'),
      kw($, 'from'),
      $._sql_table_name,
      optional(seq(kw($, 'as'), $.identifier)),
      optional($.sql_where_clause),
      ';',
    ),

    sql_update_statement: $ => seq(
      kw($, 'update'),
      $._sql_table_name,
      optional(seq(kw($, 'as'), $.identifier)),
      kw($, 'set'),
      $._sql_set_list,
      optional($.sql_where_clause),
      ';',
    ),

    sql_alter_table: $ => seq(
      kw($, 'alter'),
      kw($, 'table'),
      $._sql_table_name,
      repeat1(choice($.identifier, $.quoted_string, $.number, '(', ')', ',', '=', '.')),
      ';',
    ),

    sql_describe_statement: $ => seq(
      kw($, 'describe'),
      choice(kw($, 'table'), kw($, 'view')),
      sep1(',', $._sql_table_name),
      ';',
    ),

    sql_connect_statement: $ => seq(
      kw($, 'connect'),
      kw($, 'to'),
      $.identifier,
      optional(seq(kw($, 'as'), $.identifier)),
      optional(seq('(', repeat(choice($.quoted_string, $.identifier, $.number, '=')), ')')),
      ';',
    ),

    sql_disconnect: $ => seq(
      kw($, 'disconnect'),
      optional(kw($, 'from')),
      $.identifier,
      ';',
    ),

    sql_reset: $ => seq(
      kw($, 'reset'),
      repeat(choice($.identifier, $.quoted_string, $.number, '=')),
      ';',
    ),

    sql_validate: $ => seq(
      kw($, 'validate'),
      $._sql_select_query,
      ';',
    ),

    sql_qualified_star: $ => prec(1, seq(
      choice($.identifier, $.macro_variable_reference, $.dotted_identifier),
      token.immediate(/\.\*/),
    )),

    sql_qualified_column: $ => seq(
      field('base', choice($.identifier, $.macro_variable_reference, $.dotted_identifier)),
      field('member', token.immediate(seq('.', /[a-zA-Z_][a-zA-Z0-9_]*/))),
    ),

    sql_expression: $ => choice(
      $.sql_qualified_star,
      $.sql_case_expression,
      seq(kw($, 'exists'), '(', $._sql_select_query, ')'),
      $.expression,
      '*',
    ),

    sql_case_expression: $ => seq(
      kw($, 'case'),
      optional($.expression),
      repeat1(seq(
        kw($, 'when'),
        $.sql_expression,
        kw($, 'then'),
        $.sql_expression,
      )),
      optional(seq(kw($, 'else'), $.sql_expression)),
      kw($, 'end'),
    ),

    // ========================================================================
    // Consolidated PROC statements
    // ========================================================================

    _subblock_statement: $ => choice(
      $.assignment_statement,
      $.if_statement,
      $.do_block,
      $.select_statement,
      $.call_statement,
      $.return_statement,
      $.leave_statement,
      $.continue_statement,
      $.length_statement,
      $.array_statement,
      $.format_statement,
      $.put_statement,
      $.hash_declaration_statement,
      $.report_line_statement,
      $.expression_statement,
      alias($._simple_macro_statement, $.macro_statement),
      $.line_comment,
      $.bare_statement,
    ),

    proc_select_statement: $ => seq(
      kw($, 'select'),
      $.identifier,
      repeat1($.identifier),
      ';',
    ),

    // Consolidated PROC statements (proc_statement_keyword declared before identifier)

    _proc_stmt_atom: $ => choice(
      $.var_range,
      $.prefix_list,
      $.format_specifier,
      $.catalog_path,
      $.dotted_identifier,
      $.macro_compound_name,
      $.macro_variable_reference,
      $.macro_function_call,
      $.macro_quoting_function,
      $.identifier,
      $.name_literal,
      $.quoted_string,
      $.date_literal,
      $.time_literal,
      $.datetime_literal,
      $.hex_literal,
      $.number,
      $.missing_value,
      alias(choice(
        $._kw_to, $._kw_by, $._kw_all, $._kw_in, $._kw_as, $._kw_on, $._kw_of,
        $._kw_not, $._kw_and, $._kw_or, $._kw_is, $._kw_descending, $._kw_notsorted,
        $._kw_missing, $._kw_null, $._kw_asc, $._kw_desc,
        $._kw_data, $._kw_out, $._kw_order, $._kw_group, $._kw_table,
        $._kw_label, $._kw_format, $._kw_informat, $._kw_length, $._kw_where,
        $._kw_keep, $._kw_drop, $._kw_rename, $._kw_select, $._kw_left, $._kw_right,
        $._kw_before, $._kw_after, $._kw_display, $._kw_analysis, $._kw_across,
        $._kw_computed, $._kw_style, $._kw_line, $._kw_index, $._kw_value,
        $._kw_file, $._kw_infile, $._kw_options, $._kw_option, $._kw_when,
        $._kw_case,
      ), $.identifier),
      seq('(', repeat($._proc_stmt_atom), ')'),
      seq('[', repeat($._proc_stmt_atom), ']'),
      seq('{', repeat($._proc_stmt_atom), '}'),
      '=', '*', ',', '/', '+', '-', ':', '@', '#',
    ),

    proc_statement: $ => choice(
      seq(
        field('keyword', choice(
          $.proc_statement_keyword,
          alias(choice($._kw_table, $._kw_order, $._kw_group, $._kw_option, $._kw_data, $._kw_out), $.proc_statement_keyword),
        )),
        repeat($._proc_stmt_atom),
        ';',
      ),
      seq(
        field('keyword', alias($._kw_label, $.proc_statement_keyword)),
        '=',
        repeat1($._proc_stmt_atom),
        ';',
      ),
    ),

    _class_slash_options: $ => seq('/', repeat1(choice(
      seq($.identifier, '=', '(', repeat1(choice($.identifier, $.number, $.quoted_string, $.macro_variable_reference, ',')), ')'),
      seq($.identifier, '=', choice($.identifier, $.dotted_identifier, $.number, $.quoted_string, $.macro_variable_reference, $.format_specifier)),
      $.identifier,
      $.macro_variable_reference,
    ))),

    proc_output_statement: $ => seq(
      kw($, 'output'),
      optional(prec(1, seq(kw($, 'out'), '=', $.data_reference))),
      repeat(choice(
        seq($.identifier, '='),
        $.var_range,
        $.macro_compound_name,
        $.identifier,
        $.macro_variable_reference,
        $.number,
      )),
      optional($._class_slash_options),
      ';',
    ),

    model_option: $ => prec(1, seq(
      $.identifier, '=',
      $.identifier,
      '(', repeat1(choice(
        seq($.identifier, '=', choice($.identifier, $.number, $.quoted_string)),
        $.identifier,
        $.number,
      )), ')',
    )),

    model_statement: $ => seq(
      kw($, 'model'),
      choice($.identifier, $.macro_variable_reference),
      optional(seq('(', $.identifier, '=', choice($.quoted_string, $.identifier, $.number), ')')),
      '=',
      repeat(choice($.identifier, $.macro_variable_reference, '*')),
      optional(seq('/', repeat1(choice(
        $.model_option,
        seq($.identifier, '=', $.expression),
        $.identifier,
        $.macro_variable_reference,
      )))),
      ';',
    ),

    // ========================================================================
    // PROC FREQ
    // ========================================================================

    _freq_table_term: $ => choice(
      seq('(', repeat1(choice($.identifier, $.macro_variable_reference, '*')), ')'),
      $.identifier,
      $.macro_variable_reference,
    ),

    freq_tables_statement: $ => seq(
      kw($, 'tables'),
      repeat1(seq(
        $._freq_table_term,
        repeat(seq('*', $._freq_table_term)),
      )),
      optional(seq('/', repeat1(choice(
        $.data_set_option,
        $.identifier,
        $.quoted_string,
        $.number,
        $.macro_variable_reference,
        '=', ',', '.',
      )))),
      ';',
    ),

    // ========================================================================
    // PROC REPORT
    // ========================================================================

    report_column_statement: $ => seq(
      choice(kw($, 'column'), kw($, 'columns')),
      repeat1(choice(
        $.identifier,
        $.macro_variable_reference,
        seq('(', repeat1(choice($.identifier, $.quoted_string, $.macro_variable_reference)), ')'),
      )),
      ';',
    ),

    report_define_statement: $ => seq(
      kw($, 'define'),
      choice($.identifier, $.macro_variable_reference),
      '/',
      repeat1(choice(
        alias($._report_usage_keyword, $.report_usage_keyword),
        $._report_style_attr,
        seq(choice(alias($._report_usage_keyword, $.identifier), $.identifier), '=', choice($.format_specifier, $.expression)),
        $.identifier,
        $.quoted_string,
        $.number,
        seq('(', repeat(choice($.identifier, $.number, '=', ',', $.quoted_string)), ')'),
        seq('[', repeat(choice($.identifier, $.number, '=', ',', $.quoted_string)), ']'),
        seq('{', repeat(choice($.identifier, $.number, '=', ',', $.quoted_string)), '}'),
      )),
      ';',
    ),

    report_compute_statement: $ => seq(
      kw($, 'compute'),
      choice(
        seq(choice(kw($, 'before'), kw($, 'after')), optional($.identifier)),
        seq($.identifier, optional(choice(kw($, 'before'), kw($, 'after')))),
      ),
      optional(seq('/', repeat1(choice($.identifier, seq($.identifier, '=', $.number))))),
      ';',
      repeat(choice($._subblock_statement, $.null_statement)),
      kw($, 'endcomp'),
      ';',
    ),

    report_break_statement: $ => seq(
      kw($, 'break'),
      choice(kw($, 'before'), kw($, 'after')),
      $.identifier,
      '/',
      repeat1(choice($.identifier, $._report_style_attr)),
      ';',
    ),

    report_rbreak_statement: $ => seq(
      kw($, 'rbreak'),
      choice(kw($, 'before'), kw($, 'after')),
      '/',
      repeat1(choice($.identifier, $._report_style_attr)),
      ';',
    ),

    _style_attr_body: $ => repeat1(choice(
      $.identifier,
      alias($._kw_in, $.identifier),
      $.number,
      $.quoted_string,
      $.macro_variable_reference,
      '=', ',', '-', '/', '%',
    )),

    _report_style_attr: $ => prec(1, seq(
      kw($, 'style'),
      optional(seq('(', repeat(choice($.identifier, '=')), ')')),
      '=',
      choice(
        seq('{', optional($._style_attr_body), '}'),
        seq('[', optional($._style_attr_body), ']'),
        seq('(', optional($._style_attr_body), ')'),
      ),
    )),

    _report_usage_keyword: $ => prec(1, choice(
      kw($, 'display'),
      kw($, 'group'),
      kw($, 'analysis'),
      kw($, 'across'),
      kw($, 'order'),
      kw($, 'computed'),
    )),

    report_line_statement: $ => seq(
      kw($, 'line'),
      repeat1(choice(
        seq('@', $.number),
        $.quoted_string,
        $.format_specifier,
        $.identifier,
        $.number,
        $.macro_variable_reference,
      )),
      ';',
    ),

    // ========================================================================
    // PROC COPY / DATASETS / FCMP / GTL
    // ========================================================================

    copy_statement: $ => choice(
      prec.right(seq(kw($, 'copy'), kw($, 'out'), '=', $.identifier, ';', repeat(choice(
        seq(kw($, 'select'), repeat1($.identifier), ';'),
        seq(/[eE][xX][cC][lL][uU][dD][eE]/, repeat1($.identifier), ';'),
      )))),
      seq(kw($, 'copy'), repeat(choice($.identifier, $.macro_variable_reference)), ';'),
    ),

    _datasets_modify_substmt: $ => choice(
      seq(kw($, 'label'), $.identifier, '=', $.quoted_string, ';'),
      seq(kw($, 'rename'), $.identifier, '=', $.identifier, ';'),
      seq(kw($, 'format'), repeat1(choice($.format_specifier, $.identifier)), ';'),
      seq(kw($, 'index'), repeat1(choice($.identifier, seq($.identifier, '=', $.identifier))), ';'),
    ),

    datasets_modify_statement: $ => prec.right(seq(
      kw($, 'modify'),
      $.identifier,
      ';',
      repeat($._datasets_modify_substmt),
    )),

    _fcmp_body: $ => repeat1(choice(
      $.fcmp_outargs_statement,
      $._subblock_statement,
      $.null_statement,
    )),

    _fcmp_params: $ => seq('(', repeat(choice($.identifier, ',', $.macro_variable_reference)), ')'),

    _fcmp_rest: $ => seq(
      optional(seq('$', $.number)),
      ';',
      optional($._fcmp_body),
      kw($, 'endsub'),
      ';',
    ),

    fcmp_function_block: $ => seq(
      kw($, 'function'),
      field('name', $.identifier),
      field('params', optional($._fcmp_params)),
      $._fcmp_rest,
    ),

    fcmp_subroutine_block: $ => seq(
      kw($, 'subroutine'),
      field('name', $.identifier),
      field('params', optional($._fcmp_params)),
      $._fcmp_rest,
    ),

    fcmp_outargs_statement: $ => seq(kw($, 'outargs'), repeat1($.identifier), ';'),

    gtl_define_block: $ => prec(1, seq(
      kw($, 'define'),
      kw($, 'statgraph'),
      field('name', $.identifier),
      ';',
      repeat(choice(
        $.proc_statement,
        alias($._inline_macro_stmt, $.macro_statement),
        $.line_comment,
        $.bare_statement,
      )),
      kw($, 'end'),
      ';',
    )),

    // ========================================================================
    // Expressions & literals
    // ========================================================================

    expression: $ => choice(
      $.binary_expression,
      $.unary_expression,
      $.parenthesized_expression,
      $.function_call,
      $.method_call,
      $.macro_compound_name,
      $.macro_variable_reference,
      $.macro_quoting_function,
      $.array_element,
      $.dotted_identifier,
      $.identifier,
      $.date_literal,
      $.time_literal,
      $.datetime_literal,
      $.hex_literal,
      $.name_literal,
      $.quoted_string,
      $.missing_value,
      $.number,
    ),

    in_list: $ => seq(
      '(',
      choice(
        $._sql_select_query,
        repeat1(seq(
          $.expression,
          optional(seq(':', $.expression)),
          optional(','),
        )),
      ),
      ')',
    ),

    array_element: $ => prec(1, seq(
      field('array', $.identifier),
      choice('[', '{'),
      field('index', $.expression),
      repeat(seq(',', $.expression)),
      choice(']', '}'),
    )),

    dotted_identifier: $ => prec(3, seq(
      field('base', choice($.identifier, $.macro_variable_reference)),
      '.',
      field('member', choice($.macro_compound_name, $.identifier, $.name_literal, $.macro_variable_reference)),
    )),

    binary_expression: $ => choice(
      // Concatenation and bar OR
      prec.left(2, seq(field('left', $.expression), field('operator', choice('||', '!!', '|')), field('right', $.expression))),
      // Addition, subtraction, and min/max operators (><, <>)
      prec.left(3, seq(field('left', $.expression), field('operator', choice('+', '-', '><', '<>')), field('right', $.expression))),
      // Multiplication / division
      prec.left(4, seq(field('left', $.expression), field('operator', choice('*', '/')), field('right', $.expression))),
      // Exponentiation
      prec.left(5, seq(field('left', $.expression), field('operator', '**'), field('right', $.expression))),
      // Comparison operators (symbolic, colon-prefix, and word forms)
      prec.left(1, seq(field('left', $.expression), field('operator', choice(
        '=',
        alias($._comp_sym_op, $.comparison_operator),
        alias($._comp_word_op, $.comparison_operator),
      )), field('right', $.expression))),
      // IN / NOT IN with value list or expression
      prec.left(1, seq(
        field('left', $.expression),
        optional(kw($, 'not')),
        field('operator', kw($, 'in')),
        optional(':'),
        choice($.in_list, field('right', $.expression)),
      )),
      // BETWEEN x AND y
      prec.left(1, seq(field('left', $.expression), optional(kw($, 'not')), kw($, 'between'), field('right', $.expression), kw($, 'and'), field('right', $.expression))),
      // IS [NOT] MISSING / NULL
      prec.left(1, seq(field('left', $.expression), kw($, 'is'), optional(kw($, 'not')), choice(kw($, 'missing'), kw($, 'null')))),
      // Logical AND / OR
      prec.left(1, seq(field('left', $.expression), field('operator', choice(kw($, 'and'), kw($, 'or'))), field('right', $.expression))),
    ),

    unary_expression: $ => prec(6, seq(
      field('operator', choice('-', '+', kw($, 'not'), '^', '~')),
      field('operand', $.expression),
    )),

    parenthesized_expression: $ => seq('(', choice($.expression, $._sql_select_query), ')'),

    _func_parens: $ => seq(
      '(',
      optional(choice(
        seq(kw($, 'of'), repeat1(choice($.var_range, $.prefix_list, $.macro_compound_name, $.identifier, $.macro_variable_reference, ','))),
        sep1(',', seq(optional(kw($, 'distinct')), choice($.expression, $.format_specifier, '*'))),
      )),
      ')',
    ),

    function_call: $ => prec(1, seq(
      field('name', $.identifier),
      $._func_parens,
    )),

    _method_parens: $ => seq(
      '(',
      optional(sep1(',', choice($.expression, '*'))),
      ')',
    ),

    method_call: $ => prec(2, seq(
      field('object', $.identifier),
      '.',
      field('method', $.identifier),
      $._method_parens,
    )),

    macro_variable_reference: $ => seq(
      repeat1('&'),
      field('name', $.identifier),
      optional(token.immediate('.')),
    ),

    number: $ => /\d+(\.\d*)?|\.\d+/,

    // ========================================================================
    // Global statements
    // ========================================================================

    global_statement: $ => choice(
      $.libname_statement,
      $.filename_statement,
      $.include_statement,
      $.options_statement,
      $.title_statement,
      $.footnote_statement,
      $.ods_statement,
      $.dm_statement,
      $.x_statement,
    ),

    libname_statement: $ => seq(
      kw($, 'libname'),
      field('name', $.identifier),
      repeat(choice(
        seq($.identifier, '=', choice($.identifier, $.number, $.quoted_string, $.macro_variable_reference)),
        $.identifier,
        $.quoted_string,
        $.macro_variable_reference,
      )),
      ';',
    ),

    filename_statement: $ => seq(
      kw($, 'filename'),
      field('name', $.identifier),
      repeat(choice(
        seq($.identifier, '=', choice($.identifier, $.number, $.quoted_string, $.macro_variable_reference)),
        $.identifier,
        $.quoted_string,
        $.macro_variable_reference,
      )),
      ';',
    ),

    _include_opts: $ => seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number)), $.identifier))),

    include_statement: $ => seq(
      kw($, '%include'),
      repeat1(choice($.quoted_string, $.identifier, $.macro_variable_reference)),
      optional($._include_opts),
      ';',
    ),

    _option_atom: $ => choice(
      $.quoted_string,
      $.macro_variable_reference,
      $.macro_function_call,
      $.macro_quoting_function,
      $.format_specifier,
      $.dotted_identifier,
      $.identifier,
      $.number,
      $.missing_value,
      seq('(', repeat($._option_atom), ')'),
    ),

    options_statement: $ => seq(
      choice(kw($, 'options'), kw($, 'option')),
      repeat(choice(
        seq($.identifier, '=', $._option_atom),
        $._option_atom,
      )),
      ';',
    ),

    _title_body: $ => seq(
      repeat(choice(
        seq($.identifier, '=', $._option_atom),
        $._option_atom,
        '/',
        '#',
      )),
      ';',
    ),

    title_statement: $ => prec(2, seq(
      kw($, 'title'),
      $._title_body,
    )),

    footnote_statement: $ => prec(2, seq(
      kw($, 'footnote'),
      $._title_body,
    )),

    x_statement: $ => token(prec(1, /[xX][ \t]+('([^']|'')*'|"([^"]|"")*")\s*;/)),

    // ========================================================================
    // Comments & Strings / Typed Literals
    // ========================================================================

    line_comment: $ => token(seq('*', /[^;]*/, ';')),
    macro_comment: $ => token(seq('%*', /[^;]*/, ';')),
    separator_comment: $ => token(/#+/),

    quoted_string: $ => choice(
      $.single_quoted_string,
      $.double_quoted_string,
    ),

    single_quoted_string: $ => token(seq("'", /([^']|'')*/, "'")),
    double_quoted_string: $ => token(seq('"', /([^"]|"")*/, '"')),

    name_literal: $ => token(prec(2, seq(
      choice(
        seq("'", /([^']|'')*/, "'"),
        seq('"', /([^"]|"")*/, '"'),
      ),
      /[nN]/,
    ))),

    date_literal: $ => token(prec(2, seq(
      choice(
        seq("'", /([^']|'')*/, "'"),
        seq('"', /([^"]|"")*/, '"'),
      ),
      /[dD]/,
    ))),

    time_literal: $ => token(prec(2, seq(
      choice(
        seq("'", /([^']|'')*/, "'"),
        seq('"', /([^"]|"")*/, '"'),
      ),
      /[tT]/,
    ))),

    datetime_literal: $ => token(prec(3, seq(
      choice(
        seq("'", /([^']|'')*/, "'"),
        seq('"', /([^"]|"")*/, '"'),
      ),
      /[dD][tT]/,
    ))),

    hex_literal: $ => token(prec(2, seq(
      choice(
        seq("'", /([^']|'')*/, "'"),
        seq('"', /([^"]|"")*/, '"'),
      ),
      /[xX]/,
    ))),

  },
});
