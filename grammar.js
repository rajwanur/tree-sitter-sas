// Tree-sitter SAS grammar definition
// Phase 1 Plan 04: Complete grammar with 20 dedicated PROC body rules

module.exports = grammar({
  name: 'sas',

  // Note: word token removed -- case-insensitive keyword matching is handled
  // via explicit token rules with regex patterns (/[dD][aA][tT][aA]/ etc).
  // These regex tokens have distinct AST node names so tree-sitter's GLR
  // parser can distinguish keywords from identifiers.

  // Whitespace and block comments appear between any tokens.
  // Line comments (* ...;) and macro comments (%* ...;) are NOT in extras because
  // the * token conflicts with the multiplication operator inside expressions.
  // Instead, they are handled as statement alternatives.
  // This is critical for error recovery: extras allow the parser to skip
  // whitespace/comments at any position (DIAG-01).
  extras: $ => [
    /\s/,
    $.block_comment,
    $.separator_comment,
  ],

  // External scanner tokens -- custom C scanner in src/scanner.c.
  // CARDS/DATALINES blocks contain freeform data that cannot be parsed as SAS code.
  // Stub implementation; full implementation in Plan 03.
  externals: $ => [
    $._cards_block,
    $._cards4_block,
  ],

  // Genuine ambiguities where GLR should explore both paths.
  // Every conflict entry MUST have a comment explaining the genuine ambiguity.
  conflicts: $ => [
    // Dangling else: "if x then if y then a; else b;" -- the else could bind to
    // either the outer or inner if. GLR explores both paths (PARSE-02, PARSE-03).
    [$.if_statement, $.if_statement],
    // Dangling else in macro: same ambiguity as base SAS if_statement.
    [$.macro_if_statement, $.macro_if_statement],
    // assignment_statement vs bare_statement: both start with an identifier.
    // assignment_statement expects '=' after the identifier, but the parser cannot
    // distinguish them without looking ahead past the identifier (and optional .ident).
    [$.assignment_statement, $.bare_statement],
    // format/informat_statement: the repeat1 body can end after identifiers or
    // continue with a number. GLR explores both reduce and shift paths.
    [$.format_statement],
    [$.informat_statement],
    // function_call vs expression: "identifier(" is ambiguous -- could be a function
    // call (name + args) or an expression followed by parenthesized_expression.
    [$.expression, $.function_call],
    // array_statement: after the bracket clause, repeat1($.identifier) before ';'
    // is ambiguous with the next statement starting with an identifier.
    [$.array_statement],
    // array_element vs function_call: "name(...)" is ambiguous -- could be an
    // array reference name(i) or a function call name(args). SAS uses the same
    // syntax for both, so GLR explores both interpretations.
    [$.array_element, $.function_call],
    // proc_body: repeat1(choice(...)) cannot tell whether an identifier
    // starts a new statement inside the proc body or is a new step outside.
    // Also, run/quit can match as bare_statement or as the step terminator.
    [$.proc_body],
    // proc_step: optional proc_body creates ambiguity -- parser cannot tell if next
    // token starts a proc_body statement or is a top-level item after an empty proc.
    [$.proc_step],
    // tabulate_table_statement contains $.expression which conflicts with standalone
    // $.expression when parsing "table ident1 ident2 ..." sequences.
    [$.tabulate_table_statement, $.expression],
    [$.tabulate_table_statement, $.expression, $.function_call],
    // Multiple PROC-specific *_id_statement rules start with 'id' + identifier.
    // All are in proc_body's choice(), creating lookahead conflicts.
    [$.means_id_statement, $.print_id_statement, $.transpose_id_statement, $.compare_id_statement, $.univariate_id_statement, $.reg_id_statement],
    // Multiple *_output_statement rules start with 'output' and consume identifiers.
    [$.means_output_statement, $.freq_output_statement, $.univariate_output_statement, $.reg_output_statement],
    // freq_test_statement: repeat1($.identifier) vs $.expression ambiguity
    [$.freq_test_statement, $.expression],
    // contents_flag_statement vs compare_flag_statement: both match 'noprint' etc.
    [$.contents_flag_statement, $.compare_flag_statement],
    // univariate_histogram_statement vs sgplot_histogram_statement: both start with 'histogram'
    [$.univariate_histogram_statement, $.sgplot_histogram_statement],
    // reg_plot_statement: repeat1 of expression/quoted_string vs standalone expression
    [$.reg_plot_statement, $.expression],
    // sgplot_keylegend_statement: repeat of ident/expr after keylegend creates boundary ambiguity
    [$.sgplot_keylegend_statement],
    // sql_expression: optional 'as identifier' suffix creates boundary ambiguity
    [$.sql_expression],
    // expression supertype: repeat1($.expression) creates boundary ambiguity in many contexts
    [$.expression],
    // Multiple *_class_statement rules all match 'class' + identifiers
    [$.means_class_statement, $.tabulate_class_statement, $.univariate_class_statement],
    [$.means_class_statement, $.tabulate_class_statement, $.univariate_class_statement, $.logistic_class_statement],
    // logistic_model_statement vs reg_model_statement: both match "model identifier = ..."
    [$.logistic_model_statement, $.reg_model_statement],
    // Multiple *_freq_statement rules match 'freq' + identifier
    [$.means_freq_statement, $.univariate_freq_statement],
    // Multiple *_weight_statement rules match 'weight' + identifier
    [$.means_weight_statement, $.freq_weight_statement, $.univariate_weight_statement, $.reg_weight_statement],
    // id_statement pair conflicts not covered by the larger group
    [$.transpose_id_statement, $.reg_id_statement],
    // Additional id_statement pair conflicts
    [$.means_id_statement, $.print_id_statement, $.compare_id_statement, $.univariate_id_statement],
    // output_statement pair conflicts not covered by the larger group
    [$.freq_output_statement, $.univariate_output_statement, $.reg_output_statement],
    // Multiple *_var_statement rules all match 'var' + identifiers
    [$.tabulate_var_statement, $.print_var_statement, $.transpose_var_statement, $.compare_var_statement, $.univariate_var_statement, $.reg_var_statement],
    // datasets_delete_statement vs reg_delete_statement: both match 'delete' + identifiers
    [$.datasets_delete_statement, $.reg_delete_statement],
    // datasets_modify_statement: repeat after modify body creates boundary ambiguity
    [$.datasets_modify_statement],
    // sgplot_inset_statement: repeat of ident/string creates boundary ambiguity
    [$.sgplot_inset_statement],
    // univariate_inset_statement vs sgplot_inset_statement: both start with 'inset'
    [$.univariate_inset_statement, $.sgplot_inset_statement],
    // gplot_title_statement vs sgplot_title_statement: both match 'title' + expression
    [$.gplot_title_statement, $.sgplot_title_statement],
    // gplot_footnote_statement vs sgplot_footnote_statement: both match 'footnote' + expression
    [$.gplot_footnote_statement, $.sgplot_footnote_statement],
    // sgplot_refline_statement: repeat of expression creates boundary ambiguity
    [$.sgplot_refline_statement, $.expression],
    // Multiple *_out_statement rules match 'out' '=' identifier
    [$.contents_out_statement, $.compare_out_statement],
    // report_define_statement: repeat of ident/string/expression creates boundary ambiguity
    [$.report_define_statement, $.expression],
    [$.report_define_statement, $.expression, $.function_call],
    // compare_base_statement vs append_base_statement: both match 'base' '=' identifier
    [$.compare_base_statement, $.append_base_statement],
    // gplot_plot_statement: repeat1 of expr*expr creates boundary ambiguity
    [$.gplot_plot_statement, $.expression],
    [$.gplot_plot_statement, $.expression, $.function_call],
    // macro_definition body: statement and macro_statement both contain
    // macro_statement via the statement supertype, creating LR(1) conflict.
    [$.macro_definition, $.statement],
    // macro_do_block body: same statement/macro_statement overlap as macro_definition.
    [$.macro_do_block, $.statement],
    // macro_do_block iterative variant: "%do i = expr to expr;" starts with
    // identifier = which is ambiguous with assignment_statement and bare_statement.
    [$.macro_do_block, $.assignment_statement, $.bare_statement],
    // macro_binary_expression vs binary_expression: both can match identifier-operator-identifier
    // patterns, creating conflicts in contexts where both macro_expression and expression are valid.
    [$.macro_expression, $.expression],
    // macro_expression: generic %identifier(...) vs %identifier are ambiguous when
    // followed by '(' -- GLR explores both paths (with/without arguments).
    [$.macro_expression],
    // macro_expression includes $.function_call which can conflict with macro_expression
    // when identifier( appears (could be function_call or identifier followed by parens).
    [$.macro_expression, $.function_call],
    // macro_definition vs macro_call_statement: both start with %keyword at top level.
    // The %macro keyword regex should win but GLR explores both paths.
    [$.macro_definition],
    // macro_variable_reference trailing dot: `&var.` consumes an optional '.' as the
    // SAS macro-name terminator. This conflicts when macro_variable_reference appears
    // in dotted contexts (G-01/G-02): `adam.&ds` and `&x.y = 1` want the '.' to bind
    // to the enclosing dotted rule, while bare `&var.` wants it consumed. GLR explores
    // both and the path that forms a complete parse wins. Local to one optional token,
    // so no parser-size blow-up (unlike the open-ended macro_text tail excluded above).
    [$.macro_variable_reference],
  ],

  // Top-level rules exposed as node types for polymorphic dispatch.
  supertypes: $ => [
    $.statement,
    $.expression,
  ],

  rules: {

    // ========================================================================
    // Top-level structure
    // ========================================================================

    // Tree-sitter automatically produces ERROR nodes for invalid syntax.
    // Error recovery is enabled via extras (whitespace/comments skipped at any position).
    source_file: $ => repeat($._top_level_item),

    _top_level_item: $ => choice(
      $.data_step,
      $.proc_step,
      $.macro_definition,
      $.global_statement,
      $.macro_let_statement,
      $.macro_global_statement,
      $.macro_local_statement,
      $.macro_call_statement,
      $.macro_put_statement,
      // Standalone run;/quit; outside any step context (SAS allows orphan terminators).
      $.run_statement,
      $.quit_statement,
      $.line_comment,
      $.macro_comment,
    ),

    // ========================================================================
    // Identifiers
    // ========================================================================

    // SAS identifiers start with letter, underscore, or $ prefix.
    // The $ prefix is used for special SAS variable names.
    identifier: $ => token(prec(-1, /[$a-zA-Z_][a-zA-Z0-9_]*/)),

    // ========================================================================
    // DATA step (PARSE-01, PARSE-03, PARSE-05, PARSE-06, PARSE-08)
    // ========================================================================

    data_step: $ => seq(
      alias($._data_keyword, 'data'),
      field('name', $.data_name),
      repeat(field('option', $.data_set_option)),
      ';',
      repeat(choice($.statement, $.cards_statement, $.cards4_statement)),
      alias($._run_keyword, 'run'),
      ';'
    ),

    // A dataset name can be an identifier, a macro variable reference
    // (&outdata, &out.), or a qualified library.dataset name where either
    // part may itself be a macro variable reference (adam.&ds, &lib.&ds).
    // macro_variable_reference already consumes an optional trailing dot,
    // so &out. and adam.&ds coexist without double-dot ambiguity.
    data_name: $ => choice(
      $.identifier,
      $.macro_variable_reference,
      seq(field('library', $.identifier), '.', field('dataset', choice($.identifier, $.macro_variable_reference))),
      seq('_NULL_', optional(seq('.', $.identifier))),
    ),

    data_set_option: $ => seq(
      '(',
      repeat1(seq(
        $.identifier,
        optional(seq('=', $.expression)),
      )),
      ')',
    ),

    // ========================================================================
    // PROC step (PARSE-01, PARSE-03, PARSE-06, PARSE-07, PARSE-08)
    // ========================================================================

    // proc_body is optional (via optional()) so that PROCs with no body statements
    // (e.g., "proc contents data=x; run;") don't have run; consumed as a
    // bare_statement. When proc_body IS present, it uses repeat1() internally
    // to satisfy tree-sitter's prohibition on empty-string-matching rules.
    proc_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      field('name', $.proc_name),
      optional(field('options', $.proc_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), ';'),
        seq(alias($._quit_keyword, 'quit'), ';')
      ))
    ),

    proc_name: $ => $.identifier,

    // PROC options appear on the header line before the terminating ';'.
    // Real SAS bundles all options in one statement, e.g.:
    //   proc import datafile="x.csv" out=work.x dbms=csv replace;
    // The option KEY is recognized as a case-insensitive keyword (so it highlights
    // and is distinct from a bare identifier), while unknown keys (e.g. 'data' in
    // "proc contents data=x", 'noprint') still match via the $.identifier fallback.
    // A bare keyword with no '= value' (e.g. 'replace') matches the flag form below.
    proc_options: $ => repeat1(choice(
      $.proc_option,
      $.proc_option_flag,
      $.identifier,
    )),

    // key = value  (e.g. datafile="...", dbms=csv, out=prostate)
    // Also supports complex PROC options with a parenthesized argument group:
    //   plots(stepaxis=normb unpack)=all
    //   outest(type=beta)
    proc_option: $ => seq(
      $.proc_option_key,
      optional($.proc_option_args),
      '=',
      $.expression,
    ),

    // Parenthesized argument group for complex PROC options.
    // Contents are freeform: key=value pairs, bare keywords, identifiers.
    proc_option_args: $ => seq(
      '(',
      repeat1(choice(
        seq($.identifier, '=', $.expression),
        $.identifier,
        $.number,
        $.quoted_string,
      )),
      ')',
    ),

    // A PROC option keyword with no value, e.g. 'replace' in PROC IMPORT.
    proc_option_flag: $ => alias(
      choice(
        $._replace_keyword,
        $._label_keyword,
      ),
      'proc_option_flag',
    ),

    // Option key: known IMPORT/EXPORT keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier.
    proc_option_key: $ => choice(
      alias($._datafile_keyword, 'datafile'),
      alias($._out_keyword, 'out'),
      alias($._dbms_keyword, 'dbms'),
      alias($._datarow_keyword, 'datarow'),
      alias($._getnames_keyword, 'getnames'),
      alias($._sheet_keyword, 'sheet'),
      alias($._range_keyword, 'range'),
      alias($._guessingrows_keyword, 'guessingrows'),
      alias($._outfile_keyword, 'outfile'),
      alias($._outest_keyword, 'outest'),
      alias($._data_keyword, 'data'),
      alias($._base_keyword, 'base'),
      alias($._compare_keyword, 'compare'),
      $.identifier,
    ),

    // PROC body: flat dispatch with all PROC-specific statement rules as unique named types.
    // Each PROC's statements are prefixed (e.g., sql_select_statement, means_var_statement)
    // so they produce distinct node types in the parse tree. The proc_body repeat1(choice(...))
    // pattern means any PROC body can contain any mix of these statements plus shared statements
    // (by_statement, where_statement, macro_statement) and the bare_statement fallback.
    proc_body: $ => repeat1(choice(
      // PROC SQL statements (PARSE-07 -- enables SQL injection via unique node types)
      // sql_select_statement includes FROM/WHERE/JOIN/GROUP BY/HAVING/ORDER BY as sub-clauses
      $.sql_select_statement,
      $.sql_create_table,
      $.sql_create_view,
      $.sql_drop_statement,
      $.sql_insert_into,
      $.sql_disconnect,
      $.sql_reset,
      $.sql_validate,
      // PROC MEANS / SUMMARY statements
      $.means_var_statement,
      $.means_class_statement,
      $.means_freq_statement,
      $.means_weight_statement,
      $.means_id_statement,
      $.means_output_statement,
      $.means_types_statement,
      $.means_ways_statement,
      // PROC FREQ statements
      $.freq_tables_statement,
      $.freq_exact_statement,
      $.freq_weight_statement,
      $.freq_test_statement,
      $.freq_output_statement,
      // PROC REPORT statements
      $.report_column_statement,
      $.report_define_statement,
      $.report_compute_statement,
      $.report_break_statement,
      $.report_rbreak_statement,
      $.report_order_statement,
      // PROC TABULATE statements
      $.tabulate_class_statement,
      $.tabulate_classlev_statement,
      $.tabulate_var_statement,
      $.tabulate_table_statement,
      $.tabulate_keylabel_statement,
      $.tabulate_format_statement,
      // PROC PRINT statements
      $.print_var_statement,
      $.print_id_statement,
      $.print_sum_statement,
      $.print_pageby_statement,
      // PROC TRANSPOSE statements
      $.transpose_var_statement,
      $.transpose_id_statement,
      $.transpose_idlabel_statement,
      $.transpose_copy_statement,
      // PROC CONTENTS statements
      $.contents_data_statement,
      $.contents_out_statement,
      $.contents_flag_statement,
      // NOTE: PROC IMPORT/EXPORT options are handled entirely by proc_options
      // on the header line (real SAS bundles all options behind one ';').
      // PROC COMPARE statements
      $.compare_base_statement,
      $.compare_compare_statement,
      $.compare_out_statement,
      $.compare_flag_statement,
      $.compare_id_statement,
      $.compare_var_statement,
      $.compare_with_statement,
      // PROC DATASETS statements
      $.datasets_lib_statement,
      $.datasets_kill_statement,
      $.datasets_nolist_statement,
      $.datasets_copy_statement,
      $.datasets_delete_statement,
      $.datasets_change_statement,
      $.datasets_repair_statement,
      $.datasets_save_statement,
      $.datasets_contents_statement,
      $.datasets_modify_statement,
      // PROC OPTIONS statements
      $.options_option_statement,
      $.options_group_statement,
      // PROC APPEND statements
      $.append_base_statement,
      $.append_data_statement,
      $.append_force_statement,
      $.append_getsort_statement,
      // PROC UNIVARIATE statements
      $.univariate_var_statement,
      $.univariate_class_statement,
      $.univariate_freq_statement,
      $.univariate_weight_statement,
      $.univariate_id_statement,
      $.univariate_histogram_statement,
      $.univariate_probplot_statement,
      $.univariate_qqplot_statement,
      $.univariate_output_statement,
      $.univariate_inset_statement,
      // PROC REG statements
      $.reg_model_statement,
      $.reg_var_statement,
      $.reg_weight_statement,
      $.reg_id_statement,
      $.reg_plot_statement,
      $.reg_output_statement,
      $.reg_add_statement,
      $.reg_delete_statement,
      $.reg_restrict_statement,
      $.reg_test_statement,
      // PROC GPLOT statements
      $.gplot_plot_statement,
      $.gplot_plot2_statement,
      $.gplot_symbol_statement,
      $.gplot_axis_statement,
      $.gplot_legend_statement,
      $.gplot_note_statement,
      $.gplot_title_statement,
      $.gplot_footnote_statement,
      // PROC SGPLOT statements
      $.sgplot_scatter_statement,
      $.sgplot_series_statement,
      $.sgplot_vbar_statement,
      $.sgplot_hbar_statement,
      $.sgplot_histogram_statement,
      $.sgplot_density_statement,
      $.sgplot_boxplot_statement,
      $.sgplot_reg_statement,
      $.sgplot_band_statement,
      $.sgplot_needle_statement,
      $.sgplot_refline_statement,
      $.sgplot_xaxis_statement,
      $.sgplot_yaxis_statement,
      $.sgplot_keylegend_statement,
      $.sgplot_inset_statement,
      $.sgplot_title_statement,
      $.sgplot_footnote_statement,
      // Base SAS statements shared across PROCs
      $.by_statement,
      $.where_statement,
      // Macro statements inside PROC bodies
      $.macro_statement,
      // Comments inside PROC bodies
      $.line_comment,
      $.macro_comment,
      // PROC LOGISTIC statements
      $.logistic_class_statement,
      $.logistic_model_statement,
      // PROC FORMAT statements (G-08)
      $.format_value_statement,
      // Generic fallback for unrecognized PROC sub-statements
      $.bare_statement,
    )),

    // ========================================================================
    // Standalone step terminators (orphan run;/quit; outside any step)
    // ========================================================================

    run_statement: $ => seq(alias($._run_keyword, 'run'), ';'),
    quit_statement: $ => seq(alias($._quit_keyword, 'quit'), ';'),

    // ========================================================================
    // Macro language (PARSE-01, PARSE-03, PARSE-06) -- D-02: full macro support
    // ========================================================================

    macro_definition: $ => seq(
      alias($._macro_keyword, '%macro'),
      field('name', $.identifier),
      optional(field('params', $.macro_parameters)),
      ';',
      repeat(choice($.data_step, $.proc_step, $.statement, $.macro_statement)),
      alias($._mend_keyword, '%mend'),
      optional(field('name', $.identifier)),
      ';'
    ),

    macro_parameters: $ => seq(
      '(',
      repeat(seq($.macro_parameter, optional(','))),
      ')',
    ),

    macro_parameter: $ => seq(
      field('name', $.identifier),
      optional(seq('=', field('default', $.macro_parameter_default))),
    ),

    // Macro parameter default value. Real SAS defaults are freeform text bounded
    // by the next ',' (parameter separator) or ')' (end of param list), e.g.:
    //   contvars = AGE AGEGR1N HEIGHT   (space-separated identifier list)
    //   where    = %str()               (empty-string macro function)
    //   decimals = 1                    (number)
    // We use macro_param_text -- a permissive form like macro_text but whose raw
    // token excludes ',' and ')' so a default stops at the next parameter
    // separator rather than swallowing it (G-06).
    macro_parameter_default: $ => $.macro_param_text,

    // Macro call statement -- arbitrary user macro invocation as a statement.
    // Handles patterns like:
    //   %mymacro;
    //   %mymacro(param1, param2);
    //   %x_util_gmlstart;
    // This is distinct from macro_function_call which handles known built-in
    // macro functions (%sysfunc, %scan, etc.) and returns a value.
    //
    // NOTE: the freeform-text tail (`%put &nvars;` etc.) used to live here via
    // $.macro_text. That open-ended repeat1 tail, when reachable inside a
    // recursive macro body, caused massive GLR state explosion (~160K extra
    // parser.c lines). The freeform-text need is now served by the dedicated,
    // keyword-prefixed macro_put_statement below, and this rule is restricted
    // to bounded forms: `%name` or `%name(...)`. This makes it safe to include
    // in macro_statement (in-body calls) without explosion.
    macro_call_statement: $ => seq(
      field('name', seq('%', $.identifier)),
      choice(
        // With parenthesized args: %mymacro(a, b). The trailing ';' is optional
        // because SAS treats it as a null statement -- %mymacro(a, b) is a
        // complete call ending at the closing ')'.
        seq('(', repeat(seq($.macro_expression, optional(','))), ')', optional(';')),
        // Without args: %mymacro; -- ';' is required to avoid swallowing
        // following tokens (no ')' to bound the call).
        ';'
      ),
    ),

    // %PUT -- dedicated rule for `%put <freeform text>;`.
    // %put is a fixed keyword, so there is no GLR ambiguity with other macro
    // statements at the `%` position: the tokenizer matches the %put keyword
    // token (longer than bare `%`) deterministically. The freeform body reuses
    // macro_text (the same permissive form %let uses). This is the safe home
    // for the freeform-text tail that previously lived on macro_call_statement.
    macro_put_statement: $ => seq(
      alias($._macro_put_keyword, '%put'),
      optional($.macro_text),
      ';'
    ),

    // Macro statement supertype -- used inside macro_definition bodies.
    // Now includes macro_call_statement (bounded form) and macro_put_statement
    // so that user macro calls and %put statements work inside macro bodies.
    // (Previously excluded to avoid explosion; see note on macro_call_statement.)
    macro_statement: $ => choice(
      $.macro_definition,
      $.macro_do_block,
      $.macro_if_statement,
      $.macro_let_statement,
      $.macro_global_statement,
      $.macro_local_statement,
      $.macro_function_call,
      $.macro_call_statement,
      $.macro_put_statement,
    ),

    // %DO block with WHILE/UNTIL/iterative variants
    macro_do_block: $ => seq(
      alias($._macro_do_keyword, '%do'),
      optional(choice(
        seq('%while', '(', $.macro_expression, ')', ';'),
        seq('%until', '(', $.macro_expression, ')', ';'),
        seq($.identifier, "=", $.macro_expression, alias($._macro_to_keyword, "%to"), $.macro_expression, ";"),
        ';'
      )),
      repeat(choice($.data_step, $.proc_step, $.statement, $.macro_statement)),
      alias($._macro_end_keyword, '%end'),
      ';'
    ),

    // %IF/%THEN/%ELSE -- macro conditional logic
    macro_if_statement: $ => seq(
      alias($._macro_if_keyword, '%if'),
      field('condition', $.macro_expression),
      alias($._macro_then_keyword, '%then'),
      choice(
        seq('%do', ';', repeat(choice($.data_step, $.proc_step, $.statement, $.macro_statement)), alias($._macro_end_keyword, '%end'), ';',
          optional(seq(alias($._macro_else_keyword, '%else'), choice(
            seq('%do', ';', repeat(choice($.data_step, $.proc_step, $.statement, $.macro_statement)), alias($._macro_end_keyword, '%end'), ';'),
            $.statement,
          )))),
        seq($.statement, optional(seq(alias($._macro_else_keyword, '%else'), choice(
          seq('%do', ';', repeat(choice($.data_step, $.proc_step, $.statement, $.macro_statement)), alias($._macro_end_keyword, '%end'), ';'),
          $.statement,
        ))))
      )
    ),

    // %LET -- macro variable declaration
    // The value in %let is freeform text until the semicolon. It can contain
    // paths (with \, /), dotted names (lib.dataset), macro references (&var),
    // macro functions (%upcase(...)), and arbitrary text. We use macro_text
    // which is more permissive than macro_expression for this context.
    // The value is OPTIONAL: SAS allows %let x =; (empty value, G-17).
    macro_let_statement: $ => seq(
      alias($._macro_let_keyword, '%let'),
      field('name', $.identifier),
      '=',
      optional(field('value', $.macro_text)),
      ';'
    ),

    // Macro text -- permissive value for %let and similar contexts.
    // %let values are freeform text until the semicolon. We parse them
    // as alternating segments of raw text and structured macro constructs
    // (variable references, function calls, quoted strings).
    // Raw text segments match everything except semicolons, & and % triggers,
    // and quote characters (which start separate alternatives).
    macro_text: $ => prec.right(repeat1(choice(
      $.macro_variable_reference,
      $.macro_function_call,
      $.quoted_string,
      $.macro_text_token,
    ))),

    // Raw text token in macro context -- matches runs of characters that
    // aren't semicolons, macro triggers (& and %), or quote characters. This
    // handles spaces, identifiers, numbers, operators, paths, etc. Excluding %
    // ensures %sysfunc(...), %scan(...), etc. are recognized as macro_function_call
    // nodes rather than being swallowed as raw text.
    macro_text_token: $ => /[^;"'&%]+/,

    // Macro parameter default text -- like macro_text but bounded by the macro-
    // parameter delimiters ',' and ')'. The raw token excludes both (plus the
    // usual ;"'&% set) so a default value stops at the next parameter separator.
    // This lets space-separated lists (contvars = AGE AGEGR1N HEIGHT) and macro
    // functions (where = %str()) parse as a single default without swallowing the
    // following ',' (G-06).
    macro_param_text: $ => prec.right(repeat1(choice(
      $.macro_variable_reference,
      $.macro_function_call,
      $.quoted_string,
      $.macro_param_text_token,
    ))),

    macro_param_text_token: $ => /[^;"'&%,)]+/,

    // %GLOBAL -- declare global macro variables
    macro_global_statement: $ => seq(
      alias($._global_keyword, '%global'),
      repeat1($.identifier),
      ';'
    ),

    // %LOCAL -- declare local macro variables
    macro_local_statement: $ => seq(
      alias($._local_keyword, '%local'),
      repeat1($.identifier),
      ';'
    ),

    // Macro expression -- values in macro context
    macro_expression: $ => choice(
      $.macro_binary_expression,
      $.macro_function_call,
      $.macro_variable_reference,
      seq('%', $.identifier, optional(seq('(', repeat(seq($.macro_expression, optional(','))), ')'))),
      $.function_call,
      seq('(', $.macro_expression, ')'),
      $.identifier,
      $.quoted_string,
      // SAS numeric missing value (. or .a-.z)
      $.missing_value,
      $.number,
    ),

    // Binary operators in macro expressions
    macro_binary_expression: $ => choice(
      prec.left(1, seq(field('left', $.macro_expression), field('operator', choice('=', '^=', '~=', '<=', '>=', '<', '>', 'eq', 'ne', 'gt', 'lt', 'ge', 'le')), field('right', $.macro_expression))),
      prec.left(2, seq(field('left', $.macro_expression), field('operator', '||'), field('right', $.macro_expression))),
      prec.left(3, seq(field('left', $.macro_expression), field('operator', '+'), field('right', $.macro_expression))),
      prec.left(3, seq(field('left', $.macro_expression), field('operator', '-'), field('right', $.macro_expression))),
      prec.left(4, seq(field('left', $.macro_expression), field('operator', '*'), field('right', $.macro_expression))),
      prec.left(4, seq(field('left', $.macro_expression), field('operator', '/'), field('right', $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', 'and'), field('right', $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', 'or'), field('right', $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', 'not'), field('right', $.macro_expression))),
    ),

    // Macro function calls: %SYSFUNC, %SCAN, %EVAL, etc.
    macro_function_call: $ => seq(
      field('name', choice(
        alias($._macro_sysfunc_keyword, '%sysfunc'),
        alias($._macro_scan_keyword, '%scan'),
        alias($._macro_substr_keyword, '%substr'),
        alias($._macro_upcase_keyword, '%upcase'),
        alias($._macro_lowcase_keyword, '%lowcase'),
        alias($._macro_length_keyword, '%length'),
        alias($._macro_index_keyword, '%index'),
        alias($._macro_eval_keyword, '%eval'),
        alias($._macro_sysevalf_keyword, '%sysevalf'),
        alias($._macro_str_keyword, '%str'),
        alias($._macro_nrstr_keyword, '%nrstr'),
        alias($._macro_bquote_keyword, '%bquote'),
        alias($._macro_nrbquote_keyword, '%nrbquote'),
        alias($._macro_unquote_keyword, '%unquote'),
      )),
      '(',
      repeat(seq($.macro_expression, optional(','))),
      ')'
    ),

    // ========================================================================
    // Statement supertype -- all SAS statement types
    // ========================================================================

    statement: $ => choice(
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
      $.input_statement,
      $.put_statement,
      $.keep_statement,
      $.drop_statement,
      $.retain_statement,
      $.length_statement,
      $.format_statement,
      $.informat_statement,
      $.label_statement,
      $.attrib_statement,
      $.array_statement,
      $.by_statement,
      $.call_statement,
      $.return_statement,
      $.goto_statement,
      $.select_statement,
      $.ods_statement,
      $.macro_statement,
      $.line_comment,
      $.macro_comment,
      $.bare_statement,
    ),

    // ========================================================================
    // Individual statement rules
    // ========================================================================

    // SET / MERGE / UPDATE / MODIFY -- data reference reading statements.
    // SET additionally allows %do loops interleaved with data references, since
    // macros commonly build the set list dynamically:
    //   set %do i=1 %to &n; work.ds&i %end; ;
    // (G-14)
    set_statement: $ => seq(alias($._set_keyword, 'set'), repeat1(choice($.data_reference, $.macro_do_block)), ';'),
    merge_statement: $ => seq(alias($._merge_keyword, 'merge'), repeat1($.data_reference), ';'),
    update_statement: $ => seq(alias($._update_keyword, 'update'), repeat1($.data_reference), ';'),
    modify_statement: $ => seq(alias($._modify_keyword, 'modify'), repeat1($.data_reference), ';'),

    // Either part of a data reference may be a macro variable reference,
    // e.g. set &indata; or set adam.&ds; (macro-written DATA steps).
    data_reference: $ => seq(
      choice($.identifier, $.macro_variable_reference),
      optional(seq('.', choice($.identifier, $.macro_variable_reference))),
      optional($.data_set_option),
    ),

    // WHERE -- conditional filtering
    where_statement: $ => seq(alias($._where_keyword, 'where'), $.expression, ';'),

    // IF/THEN/ELSE -- conditional execution with dangling else (PARSE-02, PARSE-03)
    if_statement: $ => seq(
      alias($._if_keyword, 'if'),
      field('condition', $.expression),
      alias($._then_keyword, 'then'),
      field('consequence', $.statement),
      optional(seq(
        alias($._else_keyword, 'else'),
        field('alternative', $.statement),
      ))
    ),

    // DO/END -- block structure with WHILE/UNTIL/iterative variants (PARSE-03, PARSE-05)
    do_block: $ => seq(
      alias($._do_keyword, 'do'),
      optional(choice(
        seq(alias($._while_keyword, 'while'), '(', $.expression, ')'),
        seq(alias($._until_keyword, 'until'), '(', $.expression, ')'),
        seq($.identifier, '=', $.expression, alias($._to_keyword, 'to'), $.expression),
      )),
      ';',
      repeat($.statement),
      alias($._end_keyword, 'end'),
      ';'
    ),

    // Assignment -- target = value;
    // Target can be a plain identifier, a macro variable reference (&flagvar
    // for macro-generated column names), a dotted name (lib.dataset), or an
    // array element with a subscript: _v[id], _x{i}. We use [] and {} for
    // subscript brackets to avoid conflict with function_call's () syntax.
    assignment_statement: $ => seq(
      field('target', choice($.identifier, $.macro_variable_reference)),
      optional(choice(
        seq('.', $.identifier),
        seq(choice('[', '{'), $.expression, choice(']', '}')),
      )),
      '=',
      field('value', $.expression),
      ';'
    ),

    // OUTPUT -- write current observation
    output_statement: $ => seq(alias($._output_keyword, 'output'), optional($.data_reference), ';'),

    // DELETE -- remove current observation (DATA step) or dataset (PROC DATASETS)
    delete_statement: $ => seq(alias($._delete_keyword, 'delete'), repeat($.identifier), ';'),

    // INPUT -- read data lines
    input_statement: $ => seq(alias($._input_keyword, 'input'), repeat1($.identifier), ';'),

    // PUT -- write to log
    put_statement: $ => seq(alias($._put_keyword, 'put'), $.expression, ';'),

    // KEEP / DROP -- variable selection
    // Variable lists may be macro variable references (&varlist), since a macro
    // may expand to a space-separated variable list (G-04).
    keep_statement: $ => seq(alias($._keep_keyword, 'keep'), repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    drop_statement: $ => seq(alias($._drop_keyword, 'drop'), repeat1(choice($.identifier, $.macro_variable_reference)), ';'),

    // RETAIN -- retain variables across iterations
    // Variables may be macro variable references (&depvar) in addition to plain
    // identifiers, since a macro may expand to a variable list.
    retain_statement: $ => seq(
      alias($._retain_keyword, 'retain'),
      repeat1(seq(choice($.identifier, $.macro_variable_reference), optional($.expression))),
      ';'
    ),

    // LENGTH -- variable length declaration
    // The declared name may be a macro variable reference (&flagvar $1),
    // common in macros that generate column names (G-04).
    length_statement: $ => seq(
      alias($._length_keyword, 'length'),
      repeat1(seq(choice($.identifier, $.macro_variable_reference), '$', repeat1(/./))),
      ';'
    ),

    // FORMAT / INFORMAT -- variable format assignment
    // SAS format specs include a trailing '.' that the lexer would otherwise
    // consume as missing_value. Using a raw regex token for the entire statement
    // body (like length_statement does) avoids all named-token conflicts.
    //   format d yymmdd10.;  format a b $10.;  format x 8.2;
    //   informat rfstdtc is8601da.;
    // FORMAT / INFORMAT -- variable format assignment
    // Accepts variable names (identifiers), macro refs, and numeric format specs.
    // Named formats with trailing dot (yymmdd10., is8601da.) require external
    // scanner support — deferred to a future iteration.
    format_statement: $ => seq(
      alias($._format_keyword, 'format'),
      repeat1(choice($.identifier, $.macro_variable_reference, $.number)),
      ';'
    ),
    informat_statement: $ => seq(
      alias($._informat_keyword, 'informat'),
      repeat1(choice($.identifier, $.macro_variable_reference, $.number)),
      ';'
    ),

    // SAS format/informat specifier as a SEQUENCE of existing tokens (not a single
    // token) to avoid lexical conflicts with identifier/number/missing_value.
    // The trailing '.' is matched as $.missing_value (which is token(/\.[a-zA-Z]?/))
    // because the lexer produces missing_value for a bare '.' character.
    //   $10.     → '$' number missing_value           (character width)
    //   $char10. → '$' identifier number missing_value (named character + width)
    //   8.       → number missing_value                (numeric width)
    //   8.2      → number                              (numeric width.decimals — one number token)
    //   yymmdd10.→ identifier number missing_value     (named format + width)
    //   date9.   → identifier number missing_value     (named format + width)
    //   is8601da.→ identifier missing_value            (named format, no width digit)
    format_specifier: $ => choice(
      seq('$', $.number, $.missing_value),               // $10.
      seq('$', $.identifier, $.number, $.missing_value), // $char10.
      seq($.number, $.missing_value),                    // 8.
      $.number,                                          // 8.2 (number already includes .d)
      seq($.identifier, $.number, $.missing_value),      // yymmdd10.  date9.
      seq($.identifier, $.missing_value),                // is8601da.  (name with no trailing width)
    ),

    // LABEL -- variable label assignment
    // The variable name may be a macro variable reference (&flagvar),
    // common in macros that generate column names (G-04).
    label_statement: $ => seq(
      alias($._label_keyword, 'label'),
      repeat1(seq(choice($.identifier, $.macro_variable_reference), '=', $.quoted_string)),
      ';'
    ),

    // ATTRIB -- combined variable attributes
    attrib_statement: $ => seq(
      alias($._attrib_keyword, 'attrib'),
      repeat1(seq($.identifier, repeat1(choice(
        seq(alias($._format_keyword, 'format'), '=', $.identifier),
        seq(alias($._informat_keyword, 'informat'), '=', $.identifier),
        seq(alias($._label_keyword, 'label'), '=', $.quoted_string),
        seq(alias($._length_keyword, 'length'), '=', $.identifier),
      )))),
      ';'
    ),

    // ARRAY -- declares an array of variables.
    // SAS allows [], {}, and () for array dimensions, but we restrict to
    // [] and {} to avoid conflict with the () initializer list and function_call.
    // The dimension can be a number, identifier, macro variable reference
    // (&nvars), or `*` (implicit dimension). An optional initializer list
    // may follow in parens, e.g. `array _v{&nvars} &covars (&nvars *0);`
    array_statement: $ => seq(
      alias($._array_keyword, 'array'),
      $.identifier,
      optional(seq(
        choice('[', '{'),
        repeat1(choice($.identifier, $.macro_variable_reference, $.number, '*')),
        choice(']', '}'),
      )),
      repeat1(choice($.identifier, $.macro_variable_reference)),
      optional(seq('(', repeat(choice($.identifier, $.macro_variable_reference, $.number, '*')), ')')),
      ';'
    ),

    // BY -- grouping variable
    // Variable lists may be macro variable references (G-04).
    by_statement: $ => seq(alias($._by_keyword, 'by'), repeat1(choice($.identifier, $.macro_variable_reference)), ';'),

    // CALL -- subroutine call
    call_statement: $ => seq(
      'call',
      $.identifier,
      '(',
      repeat(seq($.expression, optional(','))),
      ')',
      ';'
    ),

    // RETURN -- return to start of DATA step
    return_statement: $ => seq(alias($._return_keyword, 'return'), optional($.identifier), ';'),

    // GOTO -- jump to label
    goto_statement: $ => seq(alias($._goto_keyword, 'goto'), $.identifier, ';'),

    // SELECT/WHEN/OTHERWISE -- case-like construct
    select_statement: $ => seq(
      alias($._select_keyword, 'select'),
      optional(seq('(', $.expression, ')')),
      ';',
      repeat($.when_clause),
      optional($.otherwise_clause),
      alias($._end_keyword, 'end'),
      ';'
    ),

    when_clause: $ => seq(
      alias($._when_keyword, 'when'),
      '(',
      $.expression,
      ')',
      $.statement,
    ),

    otherwise_clause: $ => seq(
      alias($._otherwise_keyword, 'otherwise'),
      $.statement,
    ),

    // CARDS/DATALINES -- inline data block
    // The _cards_block external token contains the data lines.
    // The terminating semicolon on its own line is consumed by the scanner.
    cards_statement: $ => seq(
      choice(alias($._cards_keyword, 'cards'), alias($._datalines_keyword, 'datalines')),
      ';',
      $._cards_block,
    ),

    // CARDS4/DATALINES4 -- inline data block terminated by ;;;;
    cards4_statement: $ => seq(
      choice(alias($._cards4_keyword, 'cards4'), alias($._datalines4_keyword, 'datalines4')),
      ';',
      $._cards4_block,
    ),

    // ODS -- Output Delivery System
    // ODS statements are freeform: ods rtf file="x.rtf" style=rtf; ods rtf close;
    // Accept key=value pairs, identifiers, and quoted strings (G-11c).
    ods_statement: $ => seq(
      alias($._ods_keyword, 'ods'),
      $.identifier,
      repeat(choice(
        $.identifier,
        $.quoted_string,
        $.macro_variable_reference,
        $.number,
        '/',
        '(',
        ')',
        '=',
        ',',
        '.',
        '&',
      )),
      ';'
    ),

    // PROC FORMAT -- value/invalue/picture format definitions (G-08).
    // Syntax: value name range=range... e.g.
    //   value agefmt low-17='<18' 18-64='18-64' 65-high='>=65';
    //   value $sexfmt 'F'='Female' 'M'='Male';
    // The body is a series of range=value pairs terminated by ';'.
    format_value_statement: $ => seq(
      choice('value', 'invalue', 'picture'),
      $.identifier,
      repeat1(choice(
        seq($.quoted_string, '=', $.quoted_string),
        seq($.number, '-', choice($.number, $.identifier), '=', $.quoted_string),
        seq($.identifier, '-', choice($.number, $.identifier), '=', $.quoted_string),
        seq($.identifier, '=', $.quoted_string),
      )),
      ';'
    ),

    // Bare statement -- fallback for unrecognized statements (T-01-11: terminates at semicolon).
    // Only consumes raw tokens, not $.expression, to avoid ambiguity with statement dispatch.
    bare_statement: $ => seq(
      $.identifier,
      repeat(choice($.identifier, $.quoted_string, $.number, '(', ')', '=', ',', '.', '&')),
      ';'
    ),

    // ========================================================================
    // PROC SQL sub-language rules (PARSE-07 -- SQL injection support)
    // These are unique named node types consumed by proc_body's choice().
    // ========================================================================

    // SELECT statement: complete query with optional FROM/WHERE/JOIN/GROUP BY/HAVING/ORDER BY.
    // In PROC SQL, SELECT ... FROM ... WHERE ... is ONE statement ending with a single ';'.
    sql_select_statement: $ => seq(
      $._sql_select_query,
      ';'
    ),

    _sql_select_query: $ => seq(
      alias($._select_keyword, 'select'),
      optional('distinct'),
      $.sql_select_list,
      optional($.sql_from_clause),
      optional($.sql_where_clause),
      repeat($.sql_join_clause),
      optional($.sql_group_by_clause),
      optional($.sql_having_clause),
      optional($.sql_order_by_clause),
    ),

    sql_select_list: $ => repeat1(seq(
      $.sql_expression,
      optional(seq(alias($._as_keyword, 'as'), $.identifier)),
      optional(',')
    )),

    sql_from_clause: $ => seq(
      alias($._from_keyword, 'from'),
      $.sql_table_ref,
    ),

    sql_where_clause: $ => seq(
      alias($._where_keyword, 'where'),
      $.sql_expression,
      // Macro-generated suffix: `where x=1 &extracond` -- &extracond expands to
      // additional WHERE text. Accept trailing macro_variable_reference fragments
      // that represent macro-substituted conditions (G-11b).
      repeat($.macro_variable_reference),
    ),

    sql_group_by_clause: $ => seq(
      'group',
      alias($._by_keyword, 'by'),
      repeat1(seq(optional('calculated'), $.expression, optional(','))),
    ),

    sql_having_clause: $ => seq(
      alias($._having_keyword, 'having'),
      $.sql_expression,
    ),

    sql_order_by_clause: $ => seq(
      'order',
      alias($._by_keyword, 'by'),
      repeat1(seq(optional('calculated'), $.expression, optional(choice('asc', 'desc', 'ASC', 'DESC')))),
    ),

    sql_join_clause: $ => seq(
      choice(
        seq('inner', 'join'),
        seq('left', 'join'),
        seq('right', 'join'),
        seq('full', 'join'),
        seq('cross', 'join'),
        alias($._join_keyword, 'join'),
      ),
      $.sql_table_ref,
      optional(seq(alias($._on_keyword, 'on'), $.expression))
    ),

    sql_table_ref: $ => choice(
      $.macro_variable_reference,
      seq(
        $.identifier,
        optional(seq('.', choice($.identifier, $.macro_variable_reference))),
        optional(seq(alias($._as_keyword, 'as'), $.identifier))
      ),
      seq(
        '(',
        $._sql_select_query,
        ')',
        optional(seq(alias($._as_keyword, 'as'), $.identifier))
      ),
    ),

    sql_create_table: $ => seq(
      'create',
      alias($._table_keyword, 'table'),
      $.identifier,
      optional(seq('.', $.identifier)),
      choice(
        seq(alias($._as_keyword, 'as'), $._sql_select_query),
        seq('(', repeat(seq($.identifier, optional($.identifier), optional(','))), ')')
      ),
      ';'
    ),

    sql_create_view: $ => seq(
      'create',
      'view',
      $.identifier,
      optional(seq('.', $.identifier)),
      alias($._as_keyword, 'as'),
      $._sql_select_query,
      ';'
    ),

    sql_drop_statement: $ => seq(
      'drop',
      choice('table', 'view', 'index'),
      $.identifier,
      ';'
    ),

    sql_insert_into: $ => seq(
      'insert',
      'into',
      $.identifier,
      optional(seq('.', $.identifier)),
      choice(
        seq('values', repeat1(seq('(', repeat(seq($.expression, optional(','))), ')'))),
        seq($._sql_select_query, ';')
      ),
      ';'
    ),

    sql_disconnect: $ => seq(
      'disconnect',
      $.identifier,
      ';'
    ),

    sql_reset: $ => seq(
      'reset',
      repeat(choice($.identifier, $.quoted_string)),
      ';'
    ),

    sql_validate: $ => seq(
      'validate',
      $._sql_select_query,
      ';'
    ),

    sql_expression: $ => choice(
      $.expression,
      '*',  // SELECT * wildcard
      seq($.expression, optional(seq(alias($._as_keyword, 'as'), $.identifier))),
    ),

    // ========================================================================
    // PROC MEANS / SUMMARY statements
    // ========================================================================

    means_var_statement: $ => seq(alias($._var_keyword, 'var'), repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    means_class_statement: $ => seq('class', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    means_freq_statement: $ => seq('freq', choice($.identifier, $.macro_variable_reference), ';'),
    means_weight_statement: $ => seq('weight', choice($.identifier, $.macro_variable_reference), ';'),
    means_id_statement: $ => seq('id', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    // OUTPUT (MEANS) -- out=dataset and statistic-keyword=varname pairs.
    // Supports: out=work._cont_&i (dotted/macro dataset), n= mean= std= (bare
    // keyword= with no value, meaning "name the stat automatically"), and an
    // optional /options group (e.g. / autoname) (G-13).
    means_output_statement: $ => seq(
      'output',
      optional(seq('out', '=', $.data_reference)),
      repeat(choice(
        seq($.identifier, '=', $.identifier),
        seq($.identifier, '=', $.macro_variable_reference),
        seq($.identifier, '='),    // bare keyword= (auto-naming): n= mean= std=
        $.identifier,
      )),
      optional(seq('/', repeat1($.identifier))),
      ';'
    ),
    means_types_statement: $ => seq('types', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    means_ways_statement: $ => seq('ways', repeat1($.number), ';'),

    // ========================================================================
    // PROC FREQ statements
    // ========================================================================

    // TABLES (FREQ) -- cross-tab spec. Supports * crossovers and /options
    // e.g. tables &trtvar * &var / out=work.x outcum sparse; (G-13b).
    // The /options group is permissive (key=value, parens, etc.) like
    // bare_statement since FREQ options are complex: out=work.x(drop=percent).
    freq_tables_statement: $ => seq('tables', repeat1(seq(choice($.identifier, $.macro_variable_reference), repeat(choice('*', '(')), optional(choice($.identifier, $.macro_variable_reference)))), optional(seq('/', repeat1(choice($.identifier, $.quoted_string, $.number, $.macro_variable_reference, '(', ')', '=', ',', '.')))), ';'),
    freq_exact_statement: $ => seq('exact', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    freq_weight_statement: $ => seq('weight', choice($.identifier, $.macro_variable_reference), ';'),
    freq_test_statement: $ => seq('test', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    freq_output_statement: $ => seq('output', optional(seq('out', '=', $.data_reference)), repeat(choice($.identifier, seq($.identifier, '=', $.identifier))), ';'),

    // ========================================================================
    // PROC REPORT statements
    // ========================================================================

    // COLUMN -- column list. Supports grouped columns: column PARAM ("Group" COL1 COL2);
    // The parenthesized group may contain a quoted heading string plus identifiers (G-16).
    report_column_statement: $ => seq('column', repeat1(choice(
      $.identifier,
      $.macro_variable_reference,
      seq('(', repeat1(choice($.identifier, $.quoted_string)), ')'),
    )), ';'),
    // DEFINE -- column attributes. Supports display/analysis keywords and
    // style(...)=[...] option groups: define PARAM / display "Label" style(column)=[width=2in].
    // Uses raw tokens for paren/bracket groups (like bare_statement) to avoid
    // conflict with function_call (G-16).
    report_define_statement: $ => seq('define', choice($.identifier, $.macro_variable_reference), '/', repeat1(choice(
      $.identifier,
      $.quoted_string,
      $.number,
      '=',
      seq('(', repeat(choice($.identifier, $.number, '=', ',')), ')'),
      seq('[', repeat(choice($.identifier, $.number, '=', ',')), ']'),
    )), ';'),
    report_compute_statement: $ => seq('compute', $.identifier, optional(choice('before', 'after')), ';', repeat($.statement), 'endcomp', ';'),
    report_break_statement: $ => seq('break', choice('before', 'after'), $.identifier, '/', repeat1($.identifier), ';'),
    report_rbreak_statement: $ => seq('rbreak', choice('before', 'after'), '/', repeat1($.identifier), ';'),
    report_order_statement: $ => seq('order', repeat1($.identifier), ';'),

    // ========================================================================
    // PROC TABULATE statements
    // ========================================================================

    tabulate_class_statement: $ => seq('class', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    tabulate_classlev_statement: $ => seq('classlev', repeat1($.identifier), ';'),
    tabulate_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    tabulate_table_statement: $ => seq('table', repeat1(seq(choice($.identifier, seq($.identifier, '*', $.identifier), seq('(', repeat1($.identifier), ')'), $.quoted_string, $.expression), optional(','))), ';'),
    tabulate_keylabel_statement: $ => seq('keylabel', repeat1(seq($.identifier, '=', $.quoted_string)), ';'),
    tabulate_format_statement: $ => seq('format', repeat1(seq($.identifier, $.identifier)), ';'),

    // ========================================================================
    // PROC PRINT statements
    // ========================================================================

    print_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    print_id_statement: $ => seq('id', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    print_sum_statement: $ => seq('sum', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    print_pageby_statement: $ => seq('pageby', choice($.identifier, $.macro_variable_reference), ';'),

    // ========================================================================
    // PROC TRANSPOSE statements
    // ========================================================================

    transpose_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    transpose_id_statement: $ => seq('id', choice($.identifier, $.macro_variable_reference), ';'),
    transpose_idlabel_statement: $ => seq('idlabel', choice($.identifier, $.macro_variable_reference), ';'),
    transpose_copy_statement: $ => seq('copy', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),

    // ========================================================================
    // PROC CONTENTS statements
    // ========================================================================

    contents_data_statement: $ => seq('data', repeat1(seq($.identifier, optional(seq('.', $.identifier)))), ';'),
    contents_out_statement: $ => seq('out', '=', $.identifier, ';'),
    contents_flag_statement: $ => choice(
      seq('noprint', ';'),
      seq('directory', ';'),
      seq('details', ';'),
      seq('short', ';'),
    ),

    // NOTE: PROC IMPORT/EXPORT option statements were removed.
    // Real SAS writes all IMPORT/EXPORT options on the header line behind a
    // single ';', so they are parsed by proc_options/proc_option_key, not as
    // separate body statements. See proc_options above.

    // ========================================================================
    // PROC COMPARE statements
    // ========================================================================

    compare_base_statement: $ => seq('base', '=', choice($.identifier, seq($.identifier, '.', $.identifier)), ';'),
    compare_compare_statement: $ => seq('compare', '=', choice($.identifier, seq($.identifier, '.', $.identifier)), ';'),
    compare_out_statement: $ => seq('out', '=', $.identifier, ';'),
    compare_flag_statement: $ => choice(
      seq('outnoequal', ';'),
      seq('outbase', ';'),
      seq('outcomp', ';'),
      seq('outdif', ';'),
      seq('outpercent', ';'),
      seq('noprint', ';'),
      seq('listall', ';'),
    ),
    compare_id_statement: $ => seq('id', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    compare_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    compare_with_statement: $ => seq('with', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),

    // ========================================================================
    // PROC DATASETS statements
    // ========================================================================

    datasets_lib_statement: $ => seq('lib', '=', $.identifier, ';'),
    datasets_kill_statement: $ => seq('kill', ';'),
    datasets_nolist_statement: $ => seq('nolist', ';'),
    datasets_copy_statement: $ => seq('copy', optional(seq('out', '=', $.identifier)), ';', repeat(choice(
      seq('select', repeat1($.identifier), ';'),
      seq('exclude', repeat1($.identifier), ';'),
    ))),
    datasets_delete_statement: $ => seq('delete', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    datasets_change_statement: $ => seq('change', $.identifier, '=', $.identifier, ';'),
    datasets_repair_statement: $ => seq('repair', $.identifier, ';'),
    datasets_save_statement: $ => seq('save', repeat1($.identifier), ';'),
    datasets_contents_statement: $ => seq('contents', optional(seq('data', '=', choice($.identifier, seq($.identifier, '.', $.identifier)))), ';'),
    datasets_modify_statement: $ => seq('modify', $.identifier, ';', repeat(choice(
      seq('label', $.identifier, '=', $.quoted_string, ';'),
      seq('rename', $.identifier, '=', $.identifier, ';'),
      seq('format', repeat1(choice($.identifier, seq($.identifier, $.identifier))), ';'),
      seq('index', repeat1(choice($.identifier, seq($.identifier, '=', $.identifier))), ';'),
    ))),

    // ========================================================================
    // PROC OPTIONS statements
    // ========================================================================

    options_option_statement: $ => seq('option', repeat1(choice(seq($.identifier, '=', $.expression), $.identifier)), ';'),
    options_group_statement: $ => seq('group', '=', $.identifier, ';'),

    // ========================================================================
    // PROC APPEND statements
    // ========================================================================

    append_base_statement: $ => seq('base', '=', choice($.identifier, seq($.identifier, '.', $.identifier)), ';'),
    append_data_statement: $ => seq('data', '=', choice($.identifier, seq($.identifier, '.', $.identifier)), ';'),
    append_force_statement: $ => seq('force', ';'),
    append_getsort_statement: $ => seq('getsort', ';'),

    // ========================================================================
    // PROC UNIVARIATE statements
    // ========================================================================

    univariate_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_class_statement: $ => seq('class', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_freq_statement: $ => seq('freq', choice($.identifier, $.macro_variable_reference), ';'),
    univariate_weight_statement: $ => seq('weight', choice($.identifier, $.macro_variable_reference), ';'),
    univariate_id_statement: $ => seq('id', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_histogram_statement: $ => seq('histogram', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_probplot_statement: $ => seq('probplot', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_qqplot_statement: $ => seq('qqplot', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_output_statement: $ => seq('output', optional(seq('out', '=', $.data_reference)), repeat(choice($.identifier, seq($.identifier, '=', $.identifier))), ';'),
    univariate_inset_statement: $ => seq('inset', repeat1(choice($.identifier, $.quoted_string)), ';'),

    // ========================================================================
    // PROC LOGISTIC statements
    // ========================================================================

    // Model option: key=value with optional parenthesized args.
    // e.g. selection=lasso(stop=none), event='1', stop=none
    model_option: $ => seq(
      $.identifier, '=',
      $.identifier,
      optional(seq('(', repeat1(choice(
        seq($.identifier, '=', choice($.identifier, $.number, $.quoted_string)),
        $.identifier,
        $.number,
      )), ')')),
    ),

    logistic_class_statement: $ => seq("class", choice($.identifier, $.macro_variable_reference), optional(seq("(", repeat1(choice(
      seq($.identifier, "=", choice($.identifier, $.quoted_string)),
      $.identifier,
    )), ")")), ";"),
    logistic_model_statement: $ => seq("model", choice($.identifier, $.macro_variable_reference), optional(seq("(", $.identifier, "=", $.quoted_string, ")")), "=", repeat1(choice($.identifier, $.macro_variable_reference)), repeat(choice(
      seq("/", repeat1(choice(
        $.model_option,
        $.identifier,
        $.macro_variable_reference,
      ))),
      ";"
    )), ";"),

    // ========================================================================
    // PROC REG statements
    // ========================================================================

    reg_model_statement: $ => seq('model', choice($.identifier, $.macro_variable_reference), '=', repeat1(choice($.identifier, $.macro_variable_reference)), repeat(choice(
      seq('/', repeat1(choice(
        $.model_option,
        $.identifier,
        $.macro_variable_reference,
      ))),
      ';'
    )), ';'),
    reg_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    reg_weight_statement: $ => seq('weight', choice($.identifier, $.macro_variable_reference), ';'),
    reg_id_statement: $ => seq('id', choice($.identifier, $.macro_variable_reference), ';'),
    reg_plot_statement: $ => seq('plot', repeat1(choice($.expression, $.quoted_string)), ';'),
    reg_output_statement: $ => seq('output', optional(seq('out', '=', $.data_reference)), repeat(choice($.identifier, seq($.identifier, '=', $.identifier))), ';'),
    reg_add_statement: $ => seq('add', repeat1($.identifier), ';'),
    reg_delete_statement: $ => seq('delete', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    reg_restrict_statement: $ => seq('restrict', $.expression, ';'),
    reg_test_statement: $ => seq('test', $.expression, ';'),

    // ========================================================================
    // PROC GPLOT statements
    // ========================================================================

    gplot_plot_statement: $ => seq('plot', repeat1(seq($.expression, '*', $.expression, optional(seq('=', $.identifier)))), ';'),
    gplot_plot2_statement: $ => seq('plot2', repeat1(seq($.expression, '*', $.expression, optional(seq('=', $.identifier)))), ';'),
    gplot_symbol_statement: $ => seq('symbol', repeat1(choice($.identifier, seq($.identifier, '=', $.expression))), ';'),
    gplot_axis_statement: $ => seq('axis', repeat1(choice($.identifier, seq($.identifier, '=', $.expression))), ';'),
    gplot_legend_statement: $ => seq('legend', repeat1(choice($.identifier, seq($.identifier, '=', $.expression))), ';'),
    gplot_note_statement: $ => seq('note', $.quoted_string, ';'),
    gplot_title_statement: $ => seq('title', $.expression, ';'),
    gplot_footnote_statement: $ => seq('footnote', $.expression, ';'),

    // ========================================================================
    // PROC SGPLOT statements
    // ========================================================================

    sgplot_scatter_statement: $ => seq('scatter', 'x', '=', $.identifier, 'y', '=', $.identifier, repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_series_statement: $ => seq('series', 'x', '=', $.identifier, 'y', '=', $.identifier, repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_vbar_statement: $ => seq('vbar', $.identifier, repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_hbar_statement: $ => seq('hbar', $.identifier, repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_histogram_statement: $ => seq('histogram', $.identifier, repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_density_statement: $ => seq('density', $.identifier, repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_boxplot_statement: $ => seq('boxplot', 'y', '=', $.identifier, repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_reg_statement: $ => seq('reg', 'x', '=', $.identifier, 'y', '=', $.identifier, repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_band_statement: $ => seq('band', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_needle_statement: $ => seq('needle', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_refline_statement: $ => seq('refline', repeat1($.expression), repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_xaxis_statement: $ => seq('xaxis', repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_yaxis_statement: $ => seq('yaxis', repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_keylegend_statement: $ => seq('keylegend', optional($.identifier), repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_inset_statement: $ => seq('inset', repeat1(choice($.identifier, $.quoted_string)), repeat(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', choice($.identifier, $.quoted_string, $.number, $.function_call)), $.identifier, $.quoted_string)))), ';'),
    sgplot_title_statement: $ => seq('title', $.expression, ';'),
    sgplot_footnote_statement: $ => seq('footnote', $.expression, ';'),

    // ========================================================================
    // Expression supertype with operator precedence (PARSE-01, T-01-04)
    // ========================================================================

    expression: $ => choice(
      $.binary_expression,
      $.unary_expression,
      $.parenthesized_expression,
      $.function_call,
      $.macro_variable_reference,
      // Array element: arr[i], _v{id}, x(j) -- common in DATA step expressions.
      $.array_element,
      // Dotted identifier: first.varname, last.varname, lib.dataset etc.
      // SAS uses this pattern extensively for BY-group indicators and
      // qualified references (lib.dataset) in expressions.
      $.dotted_identifier,
      $.identifier,
      $.quoted_string,
      // SAS numeric missing value (. or .a-.z)
      $.missing_value,
      $.number,
    ),

    // Array element access: name[expr], name{expr}.
    // SAS accepts [], {}, and () for array subscripting, but () is also the
    // function-call syntax. We restrict array_element to [] and {} to avoid
    // a pervasive conflict with function_call; x(j) parses as a function_call.
    array_element: $ => prec(1, seq(
      field('array', $.identifier),
      choice('[', '{'),
      field('index', $.expression),
      choice(']', '}'),
    )),

    // Dotted identifier -- two identifiers (or macro refs) joined by a dot.
    // Used for SAS BY-group indicators (first.USUBJID, last.LBTEST),
    // qualified references (lib.dataset, work.&contds), and other dotted-name
    // patterns. Either side may be a macro variable reference (G-11d).
    dotted_identifier: $ => seq(
      field('base', choice($.identifier, $.macro_variable_reference)),
      '.',
      field('member', choice($.identifier, $.macro_variable_reference)),
    ),

    // Operator precedence (higher number = tighter binding):
    // 1: comparison (==, !=, <, >, <=, >=, IN, NOT, AND, OR)
    // 2: concatenation (||, |)
    // 3: addition/subtraction (+, -)
    // 4: multiplication/division (*, /)
    // 5: exponentiation (**)
    // 6: unary (-, NOT, ^, ~)
    binary_expression: $ => choice(
      // Concatenation: ||
      prec.left(2, seq(field('left', $.expression), field('operator', '||'), field('right', $.expression))),
      // Bitwise OR: |
      prec.left(2, seq(field('left', $.expression), field('operator', '|'), field('right', $.expression))),
      // Addition/subtraction
      prec.left(3, seq(field('left', $.expression), field('operator', '+'), field('right', $.expression))),
      prec.left(3, seq(field('left', $.expression), field('operator', '-'), field('right', $.expression))),
      // Multiplication/division
      prec.left(4, seq(field('left', $.expression), field('operator', '*'), field('right', $.expression))),
      prec.left(4, seq(field('left', $.expression), field('operator', '/'), field('right', $.expression))),
      // Exponentiation
      prec.left(5, seq(field('left', $.expression), field('operator', '**'), field('right', $.expression))),
      // Comparison operators
      prec.left(1, seq(field('left', $.expression), field('operator', choice('=', '^=', '~=', '<=', '>=', '<', '>')), field('right', $.expression))),
      // IN operator
      prec.left(1, seq(field('left', $.expression), field('operator', 'in'), field('right', $.expression))),
      // Logical NOT
      prec.left(1, seq(field('left', $.expression), field('operator', 'not'), field('right', $.expression))),
      // Logical AND
      prec.left(1, seq(field('left', $.expression), field('operator', 'and'), field('right', $.expression))),
      // Logical OR
      prec.left(1, seq(field('left', $.expression), field('operator', 'or'), field('right', $.expression))),
    ),

    unary_expression: $ => prec(6, seq(
      field('operator', choice('-', 'not', '^', '~')),
      field('operand', $.expression)
    )),

    parenthesized_expression: $ => seq('(', $.expression, ')'),

    function_call: $ => seq(
      field('name', $.identifier),
      '(',
      repeat(seq($.expression, optional(','))),
      ')',
    ),

    // The optional trailing '.' is a word delimiter in SAS: &var. tells SAS the
    // macro variable name ends at the dot. Without it, &varx would be ambiguous
    // when followed by 'x'. The dot is consumed as part of the reference.
    macro_variable_reference: $ => seq('&', field('name', $.identifier), optional('.')),

    number: $ => /\d+(\.\d+)?/,

    // SAS numeric missing value: bare dot (.) or dot-letter (.A through .Z).
    // Used in comparisons like "if var2 = . then ..." to test for missing values.
    missing_value: $ => token(/\.[a-zA-Z]?/),

    // ========================================================================
    // Global statements -- top-level, outside DATA/PROC steps
    // ========================================================================

    global_statement: $ => choice(
      $.libname_statement,
      $.filename_statement,
      $.options_statement,
      $.title_statement,
      $.footnote_statement,
      $.ods_statement,
      $.x_statement,
    ),

    // LIBNAME -- library reference assignment with optional path and options.
    //   libname mylib "c:/temp";
    //   libname raw "%sysfunc(pathname(work))" access=readonly;
    //   libname mylib clear;
    libname_statement: $ => seq(
      alias($._libname_keyword, 'libname'),
      repeat(choice(
        seq($.identifier, '=', $.expression),
        $.quoted_string,
        $.macro_variable_reference,
        $.identifier,
      )),
      ';'
    ),

    // FILENAME -- external file reference with optional path and options.
    //   filename dump "%sysfunc(pathname(work))/dump.txt" lrecl=200;
    //   filename myref "c:/temp/data.txt";
    filename_statement: $ => seq(
      alias($._filename_keyword, 'filename'),
      repeat(choice(
        seq($.identifier, '=', $.expression),
        $.quoted_string,
        $.macro_variable_reference,
        $.identifier,
      )),
      ';'
    ),

    options_statement: $ => seq(
      alias($._options_keyword, 'options'),
      repeat(choice(
        seq($.identifier, '=', $.expression),
        seq('no', $.identifier),
        $.identifier,
      )),
      ';'
    ),

    title_statement: $ => seq(alias($._title_keyword, 'title'), optional($.expression), ';'),
    footnote_statement: $ => seq(alias($._footnote_keyword, 'footnote'), optional($.expression), ';'),
    x_statement: $ => seq('x', $.quoted_string, ';'),

    // ========================================================================
    // Comments (PARSE-04)
    // ========================================================================

    // Block comment: /* ... */
    // Non-nested C-style comment. SAS supports nested block comments but
    // tree-sitter's lexer (which handles extras tokens internally, not via
    // external scanners or recursive rules) cannot express nesting. This is a
    // known limitation. Workaround: avoid literal /* */ text inside comments.
    block_comment: $ => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),

    // Line comment: * ... ;
    // Ends at the next semicolon.
    line_comment: $ => token(seq('*', /[^;]*/, ';')),

    // Macro comment: %* ... ;
    // Like line comment but starts with %*.
    macro_comment: $ => token(seq('%*', /[^;]*/, ';')),


    // Separator comment: lines of # characters used as visual separators.
    // Not standard SAS but common in practice. Skipped via extras.
    separator_comment: $ => token(/#+/),
    // ========================================================================
    // Strings
    // ========================================================================

    quoted_string: $ => choice(
      $.single_quoted_string,
      $.double_quoted_string,
    ),

    // Single-quoted string with escaped quotes via doubling: 'don''t'
    single_quoted_string: $ => token(seq("'", /([^']|'')*/, "'")),

    // Double-quoted string with escaped quotes via doubling: "he said ""hi"""
    double_quoted_string: $ => token(seq('"', /([^"]|"")*/, '"')),

    // ========================================================================
    // Keywords -- case-insensitive patterns via character-class regex
    // Every SAS keyword is case-insensitive: DATA, Data, data are all valid.
    // ========================================================================

    // --- Control flow ---
    _data_keyword: $ => /[dD][aA][tT][aA]/,
    _proc_keyword: $ => /[pP][rR][oO][cC]/,
    _run_keyword: $ => /[rR][uU][nN]/,
    _quit_keyword: $ => /[qQ][uU][iI][tT]/,
    _do_keyword: $ => /[dD][oO]/,
    _end_keyword: $ => /[eE][nN][dD]/,
    _if_keyword: $ => /[iI][fF]/,
    _then_keyword: $ => /[tT][hH][eE][nN]/,
    _else_keyword: $ => /[eE][lL][sS][eE]/,
    _while_keyword: $ => /[wW][hH][iI][lL][eE]/,
    _until_keyword: $ => /[uU][nN][tT][iI][lL]/,
    _to_keyword: $ => /[tT][oO]/,
    _macro_to_keyword: $ => /%[tT][oO]/,
    _by_keyword: $ => /[bB][yY]/,
    _return_keyword: $ => /[rR][eE][tT][uU][rR][nN]/,
    _goto_keyword: $ => /[gG][oO][tT][oO]/,
    _select_keyword: $ => /[sS][eE][lL][eE][cC][tT]/,
    _when_keyword: $ => /[wW][hH][eE][nN]/,
    _otherwise_keyword: $ => /[oO][tT][hH][eE][rR][wW][iI][sS][eE]/,

    // --- DATA step statements ---
    _set_keyword: $ => /[sS][eE][tT]/,
    _merge_keyword: $ => /[mM][eE][rR][gG][eE]/,
    _update_keyword: $ => /[uU][pP][dD][aA][tT][eE]/,
    _modify_keyword: $ => /[mM][oO][dD][iI][fF][yY]/,
    _where_keyword: $ => /[wW][hH][eE][rR][eE]/,
    _keep_keyword: $ => /[kK][eE][eE][pP]/,
    _drop_keyword: $ => /[dD][rR][oO][pP]/,
    _retain_keyword: $ => /[rR][eE][tT][aA][iI][nN]/,
    _length_keyword: $ => /[lL][eE][nN][gG][tT][hH]/,
    _format_keyword: $ => /[fF][oO][rR][mM][aA][tT]/,
    _informat_keyword: $ => /[iI][nN][fF][oO][rR][mM][aA][tT]/,
    _label_keyword: $ => /[lL][aA][bB][eE][lL]/,
    _attrib_keyword: $ => /[aA][tT][tT][rR][iI][bB]/,
    _array_keyword: $ => /[aA][rR][rR][aA][yY]/,
    _output_keyword: $ => /[oO][uU][tT][pP][uU][tT]/,
    _delete_keyword: $ => /[dD][eE][lL][eE][tT][eE]/,
    _input_keyword: $ => /[iI][nN][pP][uU][tT]/,
    _put_keyword: $ => /[pP][uU][tT]/,
    _cards_keyword: $ => /[cC][aA][rR][dD][sS]/,
    _datalines_keyword: $ => /[dD][aA][tT][aA][lL][iI][nN][eE][sS]/,
    _cards4_keyword: $ => /[cC][aA][rR][dD][sS]4/,
    _datalines4_keyword: $ => /[dD][aA][tT][aA][lL][iI][nN][eE][sS]4/,

    // --- Global statements ---
    _libname_keyword: $ => /[lL][iI][bB][nN][aA][mM][eE]/,
    _filename_keyword: $ => /[fF][iI][lL][eE][nN][aA][mM][eE]/,
    _options_keyword: $ => /[oO][pP][tT][iI][oO][nN][sS]/,
    // title1..title10 and footnote1..footnote10 (G-05).
    _title_keyword: $ => /[tT][iI][tT][lL][eE][0-9]*/,
    _footnote_keyword: $ => /[fF][oO][oO][tT][nN][oO][tT][eE][0-9]*/,
    _ods_keyword: $ => /[oO][dD][sS]/,
    _include_keyword: $ => /%[iI][nN][cC][lL][uU][dD][eE]/,
    _global_keyword: $ => /%[gG][lL][oO][bB][aA][lL]/,
    _local_keyword: $ => /%[lL][oO][cC][aA][lL]/,
    _symdel_keyword: $ => /%[sS][yY][mM][dD][eE][lL]/,

    // --- Macro language keywords ---
    _macro_keyword: $ => /%[mM][aA][cC][rR][oO]/,
    _mend_keyword: $ => /%[mM][eE][nN][dD]/,
    _macro_do_keyword: $ => /%[dD][oO]/,
    _macro_end_keyword: $ => /%[eE][nN][dD]/,
    _macro_if_keyword: $ => /%[iI][fF]/,
    _macro_then_keyword: $ => /%[tT][hH][eE][nN]/,
    _macro_else_keyword: $ => /%[eE][lL][sS][eE]/,
    _macro_let_keyword: $ => /%[lL][eE][tT]/,
    _macro_put_keyword: $ => /%[pP][uU][tT]/,
    _macro_call_keyword: $ => /%[mM][aA][cC][rR][oO][cC][aA][lL][lL]/,
    _macro_sysfunc_keyword: $ => /%[sS][yY][sS][fF][uU][nN][cC]/,
    _macro_scan_keyword: $ => /%[sS][cC][aA][nN]/,
    _macro_substr_keyword: $ => /%[sS][uU][bB][sS][tT][rR]/,
    _macro_upcase_keyword: $ => /%[uU][pP][cC][aA][sS][eE]/,
    _macro_lowcase_keyword: $ => /%[lL][oO][wW][cC][aA][sS][eE]/,
    _macro_length_keyword: $ => /%[lL][eE][nN][gG][tT][hH]/,
    _macro_index_keyword: $ => /%[iI][nN][dD][eE][xX]/,
    _macro_eval_keyword: $ => /%[eE][vV][aA][lL]/,
    _macro_sysevalf_keyword: $ => /%[sS][yY][sS][eE][vV][aA][lL][fF]/,
    _macro_str_keyword: $ => /%[sS][tT][rR]/,
    _macro_nrstr_keyword: $ => /%[nN][rR][sS][tT][rR]/,
    _macro_bquote_keyword: $ => /%[bB][qQ][uU][oO][tT][eE]/,
    _macro_nrbquote_keyword: $ => /%[nN][rR][bB][qQ][uU][oO][tT][eE]/,
    _macro_unquote_keyword: $ => /%[uU][nN][qQ][uU][oO][tT][eE]/,

    // --- PROC SQL keywords ---
    _select_keyword: $ => /[sS][eE][lL][eE][cC][tT]/,
    _from_keyword: $ => /[fF][rR][oO][mM]/,
    _join_keyword: $ => /[jJ][oO][iI][nN]/,
    _on_keyword: $ => /[oO][nN]/,
    _as_keyword: $ => /[aA][sS]/,
    _having_keyword: $ => /[hH][aA][vV][iI][nN][gG]/,
    _table_keyword: $ => /[tT][aA][bB][lL][eE]/,
    _var_keyword: $ => /[vV][aA][rR]/,

    // --- PROC IMPORT / EXPORT option keywords (case-insensitive) ---
    // These keys appear on the PROC header line, e.g.:
    //   proc import datafile="x.csv" out=work.x dbms=csv replace;
    _datafile_keyword: $ => /[dD][aA][tT][aA][fF][iI][lL][eE]/,
    _outfile_keyword: $ => /[oO][uU][tT][fF][iI][lL][eE]/,
    _out_keyword: $ => /[oO][uU][tT]/,
    _dbms_keyword: $ => /[dD][bB][mM][sS]/,
    _replace_keyword: $ => /[rR][eE][pP][lL][aA][cC][eE]/,
    _datarow_keyword: $ => /[dD][aA][tT][aA][rR][oO][wW]/,
    _getnames_keyword: $ => /[gG][eE][tT][nN][aA][mM][eE][sS]/,
    _sheet_keyword: $ => /[sS][hH][eE][eE][tT]/,
    _range_keyword: $ => /[rR][aA][nN][gG][eE]/,
    _guessingrows_keyword: $ => /[gG][uU][eE][sS][sS][iI][nN][gG][rR][oO][wW][sS]/,
    _base_keyword: $ => /[bB][aA][sS][eE]/,
    _compare_keyword: $ => /[cC][oO][mM][pP][aA][rR][eE]/,
    _outest_keyword: $ => /[oO][uU][tT][eE][sS][tT]/,

    // --- Operators and punctuation ---
    _semicolon: $ => ';',
    _dot: $ => '.',
    _comma: $ => ',',
    _colon: $ => ':',
    _lparen: $ => '(',
    _rparen: $ => ')',
    _lbracket: $ => '[',
    _rbracket: $ => ']',
    _eq: $ => '=',
    _ne: $ => '^=',
    _lt: $ => '<',
    _gt: $ => '>',
    _le: $ => '<=',
    _ge: $ => '>=',
    _plus: $ => '+',
    _minus: $ => '-',
    _star: $ => '*',
    _slash: $ => '/',
    _ampersand: $ => '&',
    _pipe: $ => /\|\|?/,
    _tilde: $ => '~',
    _caret: $ => /\^/,
  },
});
