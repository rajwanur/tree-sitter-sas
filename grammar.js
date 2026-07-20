// Tree-sitter SAS grammar definition
// Phase 1 Plan 04: Complete grammar with 20 dedicated PROC body rules

module.exports = grammar({
  name: 'sas',

  // Note: word token removed -- case-insensitive keyword matching is handled
  // via explicit token rules with regex patterns (/[dD][aA][tT][aA]/ etc).
  // These regex tokens have distinct AST node names so tree-sitter's GLR
  // parser can distinguish keywords from identifiers.
  //
  // The 'running_total' prefix-split (where _run_keyword matched 'run' inside
  // 'running_total') is instead handled by giving identifier higher lexical
  // precedence via token.immediate on the terminator context. Setting word
  // globally broke PROC keywords (class/var/output) that double as identifiers.

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
    // put_statement: the 'var=' shorthand arm collides with expression at
    // 'identifier =' (since expression can be a bare identifier). GLR explores
    // both; the shorthand path wins when '=' follows a bare identifier/array
    // element in a PUT item list (G5).
    [$.put_statement, $.expression],
    // macro_statement vs macro_expression at 'not' (unary not prefix): a macro
    // function call followed by 'not' could be a macro_statement boundary or a
    // macro_binary/unary expression. GLR explores both (G8).
    [$.macro_statement, $.macro_expression],
    // macro_binary_expression internal: the unary 'not' arm vs a binary arm at
    // 'not expr op ...' is genuinely ambiguous. GLR explores both (G8).
    [$.macro_binary_expression],
    // report_line_statement: a format_specifier (identifier number missing_value)
    // in the LINE item list collides with identifier + number as separate items.
    // GLR explores both; the format_specifier path wins when the trailing '.'
    // (missing_value) follows (G9).
    [$.format_specifier, $.report_line_statement],
    // tabulate_table_statement: same format_specifier vs identifier+number
    // ambiguity in the TABLE token list (G10 tolerant form).
    [$.format_specifier, $.tabulate_table_statement],
    // title/footnote_statement: the leading key=value options (justify=left)
    // collide with the trailing text expression at 'identifier ='. GLR explores
    // both; the options repeat binds when '=' follows an identifier that is not
    // the text (G11).
    [$.title_statement, $.expression],
    // format_specifier (identifier number missing_value) vs the repeat1 body
    // (identifier) followed by a bare number/identifier: both can consume
    // "identifier number". GLR resolves once the trailing '.' (missing_value)
    // is or isn't seen.
    [$.format_statement, $.format_specifier],
    // format_specifier internal: "identifier $ number missing_value" can be read
    // as (identifier)($ number missing_value) or (identifier $ number
    // missing_value) — the optional '$' in format_specifier arms creates this
    // self-conflict when reached via input_statement's repeat body. GLR resolves
    // by the trailing identifier (next spec) (Task 3b, Phase 0).
    [$.format_specifier],
    // input_statement: same family of conflicts as format_statement above. The
    // repeat body alternates bare identifiers / "name $" / "name format." /
    // "name :format." forms, so "name $fmt." can be read either as (name $) +
    // bare-spec or as (name format_specifier) where format_specifier owns the
    // leading '$'. GLR explores both and the path forming a complete tree wins
    // (Task 3b, Phase 0). Without this, "name $char40." ERRORs because the
    // parser commits to the "name $" arm and cannot recover the format.
    [$.input_statement, $.format_specifier],
    // input_statement vs _input_bare_format: the standalone INPUT format arm
    // (added M-1 for `input x yymmdd10.;`) shares the (identifier number
    // missing_value) shape with the "name format_specifier" arm. GLR explores
    // both and the trailing token (next name vs ';') decides.
    [$.input_statement, $._input_bare_format],
    // format_specifier vs _input_bare_format: both match
    // (identifier number missing_value). _input_bare_format is the
    // standalone-INPUT-only subset; GLR explores both at a leading identifier.
    [$.format_specifier, $._input_bare_format],
    // function_call vs expression: "identifier(" is ambiguous -- could be a function
    // call (name + args) or an expression followed by parenthesized_expression.
    [$.expression, $.function_call],
    // binary_expression: the between/and and is-missing arms collide with the
    // comparison arms at the shared operands. GLR explores both (G13).
    [$.binary_expression],
    // proc_options vs proc_option_key: with proc_option's value now optional,
    // 'identifier identifier' is ambiguous (two bare flags vs flag+value). GLR
    // explores both (G13).
    [$.proc_options, $.proc_option_key],
    // proc_body: repeat1(choice(...)) cannot tell whether an identifier
    // starts a new statement inside the proc body or is a new step outside.
    // Also, run/quit can match as bare_statement or as the step terminator.
    [$.proc_body],
    // proc_step: optional proc_body creates ambiguity -- parser cannot tell if next
    // token starts a proc_body statement or is a top-level item after an empty proc.
    [$.proc_step],
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
    // sql_select_list: the column-attributes repeat (format=, length=) after an
    // optional alias collides with the next select item at 'identifier'.
    // "select a format=8.1, b" -- after 'a', is 'format' an attr or the alias?
    // GLR explores both; the complete-parse path wins (G3).
    [$.sql_select_list],
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
    // macro_variable_reference trailing dot: `&var.` consumes an optional '.' as the
    // SAS macro-name terminator. This conflicts when macro_variable_reference appears
    // in dotted contexts (G-01/G-02): `adam.&ds` and `&x.y = 1` want the '.' to bind
    // to the enclosing dotted rule, while bare `&var.` wants it consumed. GLR explores
    // both and the path that forms a complete parse wins. Local to one optional token,
    // so no parser-size blow-up (unlike the open-ended macro_text tail excluded above).
    [$.macro_variable_reference],
    // ods_statement lists both $.macro_variable_reference and a bare '&' token in its
    // repeat(choice(...)). When the lexer sees '&identifier' it cannot tell whether to
    // form a macro_variable_reference or take the standalone '&' and continue the repeat.
    // Genuine lexical ambiguity (the bare '&' was added in 68c15e7); GLR explores both.
    // Pre-existing latent conflict surfaced by regenerating parser.c. No corpus case
    // exercises the standalone '&' form.
    [$.ods_statement, $.macro_variable_reference],
    // The following six conflicts arise from adding expression_statement
    // (seq(macro_expression, ';')) to the statement supertype so that macro %then
    // value consequents like `%then 1;` parse (Task 1, Phase 0 grammar stabilization).
    // Because macro_expression includes $.identifier / $.macro_variable_reference /
    // $.function_call, a value-led 'expr;' statement collides at LR(1) with every
    // existing identifier/macro-led statement. These are the same genuine GLR
    // ambiguity family as the pre-existing [assignment_statement, bare_statement]
    // and [expression, function_call] declarations; GLR explores all parses and the
    // one forming a complete tree wins. Confirmed bounded (set of 6, no cascade).
    // 'identifier ;' -- bare_statement vs expression_statement(macro_expression).
    [$.macro_expression, $.bare_statement],
    // 'identifier =' -- assignment vs bare vs expression_statement (three-way).
    [$.macro_expression, $.assignment_statement, $.bare_statement],
    // '&ref =' -- assignment_statement (macro var target) vs expression_statement.
    [$.macro_expression, $.assignment_statement],
    // 'identifier (' -- bare_statement vs function_call (now reachable as a statement
    // via expression_statement -> macro_expression -> function_call).
    [$.bare_statement, $.function_call],
    // '%name(' -- macro_call_statement vs macro_expression (%name(args) form).
    [$.macro_call_statement, $.macro_expression],
    // macro_do_block body identifier-led statement ambiguity.
    [$.macro_do_block, $.macro_expression, $.assignment_statement, $.bare_statement],
  ],

  // Top-level rules exposed as node types for polymorphic dispatch.
  supertypes: $ => [
    $.statement,
    $.expression,
  ],

  // Inline rules are not surfaced as nodes in the parse tree. sql_select_item is
  // a SELECT-list-only dispatcher (sql_expression OR sql_qualified_column);
  // inlining keeps plain `select a, b` from gaining an extra wrapper node (I-1).
  inline: $ => [
    $.sql_select_item,
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
    // identifier uses prec(-1) so exact keyword tokens (run, data, set, ...) win
    // on ties. Longer identifiers (running_total) still win by longest-match.
    // The word field is used by tree-sitter's reserved-keyword handling so that
    // keywords like 'run' are NOT recognized when they are a prefix of a longer
    // identifier (running_total, dataset_name) -- a common SAS pattern.
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
      optional(choice('cancel', 'quit', 'CANCEL', 'QUIT')),
      ';'
    ),

    // A dataset name can be an identifier, a macro variable reference
    // (&outdata, &out.), or a qualified library.dataset name where either
    // part may itself be a macro variable reference (adam.&ds, &lib.&ds).
    // macro_variable_reference already consumes an optional trailing dot,
    // so &out. and adam.&ds coexist without double-dot ambiguity.
    data_name: $ => choice(
      $.identifier,
      $.name_literal,
      $.macro_variable_reference,
      seq(field('library', choice($.identifier, $.name_literal)), '.', field('dataset', choice($.identifier, $.name_literal, $.macro_variable_reference))),
      seq('_NULL_', optional(seq('.', $.identifier))),
    ),

    data_set_option: $ => seq(
      '(',
      repeat1(seq(
        $.identifier,
        // Value: either a bare expression, OR an =option-list. The latter
        // handles rename=(old=new old2=new2) where the '=' precedes a
        // parenthesized list of identifier=identifier pairs. Without this,
        // the inner (a=b c=d) fails as a single parenthesized_expression.
        optional(choice(
          seq('=', $.expression),
          seq('=', '(', repeat1(seq($.identifier, '=', $.identifier)), ')'),
        )),
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
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';')
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
    // The value may carry a trailing data_set_option group, modeling dataset
    // options on the value: out=work.x(drop=_name_), base=lib.d(keep=a b).
    // Without this, the (drop=...) suffix after a dotted value cannot parse.
    proc_option: $ => seq(
      $.proc_option_key,
      optional($.proc_option_args),
      // The '=value' is optional so bare PROC flags (outnoequal, listall, noprint,
      // replace) match as a proc_option with no value (G13).
      optional(seq(
        '=',
        // The value may be a 3-part SAS catalog path (lib.dataset.member), e.g.
        // the PROC FCMP `outlib=work.funcs.trial` option, which is not a valid
        // dotted_identifier (only 2 parts) nor a plain expression.
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // 3-part SAS catalog reference: library.dataset.member (or library.catalog.entry).
    // Used by PROC FCMP outlib=, PROC FORMAT cntlin= catalog entries, etc. Kept
    // separate from dotted_identifier (2-part) to avoid GLR ambiguity with the
    // qualified-column forms (first.var).
    catalog_path: $ => prec(2, seq(
      $.identifier, '.', $.identifier, '.', $.identifier,
    )),

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
      $.report_line_statement,
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
      // PROC IMPORT / EXPORT body statements
      // (the SAS IMPORT/EXPORT wizard emits these as separate lines after the
      // header, e.g. `guessingrows=200; datarow=2; getnames=yes;`. They are also
      // valid on the header line via proc_options; these body forms handle the
      // wizard-generated multi-line style.)
      $.import_datarow_statement,
      $.import_getnames_statement,
      $.import_guessingrows_statement,
      $.import_sheet_statement,
      $.import_range_statement,
      $.export_label_statement,
      $.export_putnames_statement,
      // PROC FCMP function/subroutine blocks (multi-statement: header ... body ... endsub;)
      $.fcmp_function_block,
      $.fcmp_subroutine_block,
      // PROC UNIVARIATE statements
      $.univariate_var_statement,
      $.univariate_class_statement,
      $.univariate_freq_statement,
      $.univariate_weight_statement,
      $.univariate_id_statement,
      $.univariate_histogram_statement,
      $.univariate_probplot_statement,
      $.univariate_qqplot_statement,
      $.univariate_cdfplot_statement,
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
      // GTL (PROC TEMPLATE) plot statements -- distinct from SGPLOT (seriesplot
      // vs series). Tolerant form: name + key=value options + /options (G13).
      $.gtl_plot_statement,
      $.gtl_define_statement,
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

    run_statement: $ => seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
    quit_statement: $ => seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),

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
      // Keyword parameter: =value or positional (no =). The default may be EMPTY
      // (outname=, tflno=, title=) -- a common flexible-API pattern where the
      // parameter exists but has no default value. Making the default optional
      // after '=' lets an empty default parse; the GLR reduce/shift conflict
      // this risks (identifier matched as positional before seeing =) is bounded
      // to a single 'identifier =' lookahead and resolved by declaring the
      // conflict in the conflicts array (G7).
      optional(seq('=', optional(field('default', $.macro_parameter_default)))),
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

    // %ABORT -- abort macro/DATA-step execution with an optional action argument.
    // Forms: %abort;  %abort cancel;  %abort return;  %abort cancel updvar=&x;
    // The bare action words (cancel, return) are not parenthesized, so they get
    // a dedicated rule rather than macro_call_statement (which only accepts
    // %name(args) or %name;).
    macro_abort_statement: $ => seq(
      alias($._macro_abort_keyword, '%abort'),
      repeat(choice($.identifier, $.number, $.macro_variable_reference, seq($.identifier, '=', $.macro_expression))),
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
      $.macro_quoting_function,
      $.macro_call_statement,
      $.macro_put_statement,
      $.macro_abort_statement,
    ),

    // %DO block with WHILE/UNTIL/iterative variants
    macro_do_block: $ => seq(
      alias($._macro_do_keyword, '%do'),
      optional(choice(
        seq('%while', '(', $.macro_expression, ')', ';'),
        seq('%until', '(', $.macro_expression, ')', ';'),
        seq($.identifier, "=", $.macro_expression, alias($._macro_to_keyword, "%to"), $.macro_expression, optional(seq(alias($._macro_by_keyword, "%by"), $.macro_expression)), ";"),
        ';'
      )),
      repeat(choice($.data_step, $.proc_step, $.statement, $.macro_statement)),
      alias($._macro_end_keyword, '%end'),
      ';'
    ),

    // %IF/%THEN/%ELSE -- macro conditional logic.
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
      $.macro_quoting_function,
      // Generic user macro call inside text: %factorial(5), %util_trim(...).
      // Bounded form (args are macro_expression, not recursive macro_text) so it
      // does NOT re-trigger the historical 160K-line parser explosion. Only
      // %name(args) -- bare %name without parens is handled by macro_text_token
      // (the % is excluded there, so a bare %name in text still errors; that is
      // rare and acceptable). G8.
      seq('%', $.identifier, '(', repeat(seq($.macro_expression, optional(','))), ')'),
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
      $.macro_quoting_function,
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
      $.macro_quoting_function,
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

    // Binary operators in macro expressions. Includes an open-comparison arm
    // (comparison with no RHS) for empty-value conditions: %if &val = %then,
    // where a macro variable resolving to empty leaves nothing after the
    // operator. This tests for emptiness. The conflict with the full comparison
    // is declared in the conflicts array (G7).
    macro_binary_expression: $ => choice(
      prec.left(1, seq(field('left', $.macro_expression), field('operator', choice('=', '^=', '~=', '<=', '>=', '<', '>', 'eq', 'ne', 'gt', 'lt', 'ge', 'le')), field('right', $.macro_expression))),
      // Open comparison -- comparison operator with no right operand (empty-value
      // test). %if &val = %then;  %if &x ne %then;
      prec.left(1, seq(field('left', $.macro_expression), field('operator', choice('=', '^=', '~=', '<=', '>=', '<', '>', 'eq', 'ne', 'gt', 'lt', 'ge', 'le')))),
      prec.left(2, seq(field('left', $.macro_expression), field('operator', '||'), field('right', $.macro_expression))),
      prec.left(3, seq(field('left', $.macro_expression), field('operator', '+'), field('right', $.macro_expression))),
      prec.left(3, seq(field('left', $.macro_expression), field('operator', '-'), field('right', $.macro_expression))),
      prec.left(4, seq(field('left', $.macro_expression), field('operator', '*'), field('right', $.macro_expression))),
      prec.left(4, seq(field('left', $.macro_expression), field('operator', '/'), field('right', $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', 'and'), field('right', $.macro_expression))),
      prec.left(1, seq(field('left', $.macro_expression), field('operator', 'or'), field('right', $.macro_expression))),
      // 'not' as a binary operator (a not b) and as a UNARY prefix (not %sysfunc(x)).
      prec.left(1, seq(field('left', $.macro_expression), field('operator', 'not'), field('right', $.macro_expression))),
      // Unary 'not' prefix: %if not %sysfunc(...) %then. Higher precedence than
      // the binary comparison arms so it binds to the following macro function (G8).
      prec(2, seq(field('operator', 'not'), field('operand', $.macro_expression))),
    ),

    // Macro function calls: %SYSFUNC, %SCAN, %EVAL, etc. (the value-returning
    // functions whose args are macro expressions). Includes the macro-state
    // helpers %SYMGET (resolve a macro variable) and %SYSMACEEXIST-style
    // existence checks (%SYMEXIST/%SYSMACEEXIST/%SYSLOCALEX/%SYSGLOBALEX) and
    // %SUPERQ (mask-a-name) used in robust macros.
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
        alias($._macro_symget_keyword, '%symget'),
        alias($._macro_sysmacexist_keyword, '%sysmacexist'),
        alias($._macro_superq_keyword, '%superq'),
      )),
      '(',
      repeat(seq($.macro_expression, optional(','))),
      ')'
    ),

    // Macro quoting functions: %STR/%NRSTR/%BQUOTE/%NRBQUOTE/%UNQUOTE. These
    // exist to wrap ARBITRARY text including %, &, >, commas, and unmatched
    // quotes -- their args are freeform text, not strict macro expressions.
    // Using macro_quoted_text (whose token allows % & , > etc., stopping only at
    // the balancing ')') avoids the cascade of ERRORs from %nrstr(This has a
    // %macro token) / %bquote(50% > 25%) / %str(,). G6.
    macro_quoting_function: $ => seq(
      field('name', choice(
        alias($._macro_str_keyword, '%str'),
        alias($._macro_nrstr_keyword, '%nrstr'),
        alias($._macro_bquote_keyword, '%bquote'),
        alias($._macro_nrbquote_keyword, '%nrbquote'),
        alias($._macro_unquote_keyword, '%unquote'),
      )),
      '(',
      optional($.macro_quoted_text),
      ')'
    ),

    // Freeform text inside a macro quoting function's parens. Allows everything
    // a quoting function is meant to neutralize -- %, &, >, <, commas, =, etc.
    // -- stopping only at the closing ')'. Nested macro constructs (variable
    // refs, nested function calls, quoted strings) are recognized as structured
    // children; everything else is macro_quoted_text_token runs.
    macro_quoted_text: $ => prec.right(repeat1(choice(
      $.macro_variable_reference,
      $.macro_function_call,
      $.macro_quoting_function,
      $.quoted_string,
      $.macro_quoted_text_token,
    ))),

    // Raw text inside a quoting function: anything except ')' (and quote chars,
    // which start separate quoted_string children). % and & ARE included --
    // quoting exists precisely to wrap them literally.
    macro_quoted_text_token: $ => /[^)'"]+/,

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
      $.hash_declaration_statement,
      $.by_statement,
      $.call_statement,
      $.return_statement,
      $.goto_statement,
      $.select_statement,
      $.ods_statement,
      $.macro_statement,
      $.line_comment,
      $.macro_comment,
      $.sum_statement,
      $.expression_statement,
      $.report_line_statement, // PROC REPORT LINE statement (valid inside COMPUTE blocks)
      $.bare_statement,
    ),

    // ========================================================================
    // Individual statement rules
    // ========================================================================

    // SET / MERGE / UPDATE / MODIFY -- data reference reading statements.
    // SET additionally allows %do loops interleaved with data references, since
    // macros commonly build the set list dynamically:
    //   set %do i=1 %to &n; work.ds&i %end; ;
    // (G-14). SET/MERGE/UPDATE/MODIFY also accept per-dataset statement options
    // OUTSIDE the data_set_option parens (end=eof, nobs=&n, point=p, key=...).
    // The trailing repeat models those options; it is local to these statements
    // (not data_reference) so it does not collide with means_output etc.
    set_statement: $ => seq(alias($._set_keyword, 'set'), repeat1(choice($.data_reference, $.macro_do_block)), repeat($.set_statement_option), ';'),
    merge_statement: $ => seq(alias($._merge_keyword, 'merge'), repeat1($.data_reference), repeat($.set_statement_option), ';'),
    update_statement: $ => seq(alias($._update_keyword, 'update'), repeat1($.data_reference), repeat($.set_statement_option), ';'),
    modify_statement: $ => seq(alias($._modify_keyword, 'modify'), repeat1($.data_reference), repeat($.set_statement_option), ';'),

    // SET/MERGE/UPDATE/MODIFY statement option (outside dataset-option parens).
    // e.g. end=eof, nobs=&nvars, point=ptr, key=primkey. Bounded to identifier/
    // macro-variable/number values (the real option-value grammar); declared as
    // a named node so navigation/highlighting can treat it uniformly.
    set_statement_option: $ => seq($.identifier, '=', choice($.identifier, $.macro_variable_reference, $.number)),

    // Either part of a data reference may be a macro variable reference
    // or a name literal (VALIDVARNAME=ANY: 'my ds'n), e.g. set &indata; or
    // set adam.&ds; or set work.'weird names'n (macro-written DATA steps).
    data_reference: $ => seq(
      choice($.identifier, $.name_literal, $.macro_variable_reference),
      optional(seq('.', choice($.identifier, $.name_literal, $.macro_variable_reference))),
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
      field('target', choice($.identifier, $.name_literal, $.macro_variable_reference)),
      optional(choice(
        seq('.', $.identifier),
        seq(choice('[', '{'), $.expression, choice(']', '}')),
      )),
      '=',
      field('value', $.expression),
      ';'
    ),

    // Expression statement -- a bare expression that terminates with ';'.
    // Needed for macro %then consequents like `%then 1;` where no other
    // statement rule can start with a number/value (Task 1, Phase 0).
    // Member of the statement supertype so it is accepted wherever a $.statement
    // is (e.g. inside macro_if_statement's consequent). The broad overlap with
    // identifier-led statements is resolved via the declared conflicts above.
    expression_statement: $ => seq($.macro_expression, ';'),

    // OUTPUT -- write current observation
    output_statement: $ => seq(alias($._output_keyword, 'output'), optional($.data_reference), ';'),

    // DELETE -- remove current observation (DATA step) or dataset (PROC DATASETS)
    delete_statement: $ => seq(alias($._delete_keyword, 'delete'), repeat($.identifier), ';'),

    // INPUT -- read data lines (list / formatted / informative-modifier styles)
    // Each spec is one of:
    //   - bare variable name (identifier / name literal for VALIDVARNAME=ANY /
    //     macro reference for macro-generated var lists, G-04)
    //   - name $                  (character, no width)
    //   - name $format.            ($char40., $20.)  or  name format. (yymmdd10.)
    //   - name :[$]format.         (:yymmdd10. informative modifier)
    // Format specs reuse $.format_specifier (Task 5, Phase 0) which models the
    // trailing '.' as $.missing_value to avoid lexical conflicts. Column input
    // (name $ start-end) and pointer controls (@n, @@, #) are NOT supported —
    // YAGNI: no s-test line needs them.
    input_statement: $ => seq(
      alias($._input_keyword, 'input'),
      repeat1(choice(
        // Column/relative pointer controls: @1 (absolute column), +1 (relative),
        // @@ (hold line), #n (go to line n). These may prefix or interleave with
        // variable specs in column-style INPUT (G5).
        seq('@', $.number),
        seq('+', $.number),
        '@@',
        seq('#', $.number),
        // bare variable name
        choice($.identifier, $.name_literal, $.macro_variable_reference),
        // name $              (character, no width) — bare '$' NOT part of a format
        seq(choice($.identifier, $.name_literal, $.macro_variable_reference), '$'),
        // name $format.  or  name format.   (formatted). The optional('$' ) is
        // consumed HERE (not inside format_specifier) because the lexer emits
        // "$char40" as ONE identifier token, so format_specifier's own '$' arms
        // (which expect '$' identifier number) cannot match "$char40.". The
        // trailing "char40." then matches format_specifier's (identifier
        // missing_value) arm. For "$20." the '$' is consumed here and "20."
        // matches (number missing_value). For "yymmdd10." no '$' and it matches
        // (identifier number missing_value). GLR explores the '$'-shift vs
        // '$'-reduce paths; see the conflicts: declarations below.
        seq(choice($.identifier, $.name_literal, $.macro_variable_reference), optional('$'), $.format_specifier),
        // name :format.  or  name :$format.  (informative modifier)
        seq(choice($.identifier, $.name_literal, $.macro_variable_reference), ':', optional('$'), $.format_specifier),
        // standalone named format with NO preceding name, e.g. `input x yymmdd10.;`
        // where x is a bare variable and yymmdd10. is a format on its own. We
        // reuse only the NON-'$'-leading subset of format_specifier (via the
        // _input_bare_format rule, which excludes the two '$'-leading arms) so it
        // cannot compete with the "name $" arm at a leading '$' (which broke
        // "input k $ v $;" / "input line $char40." when a full format_specifier
        // was listed). Aliased to $.format_specifier so the parse tree shows a
        // uniform format_specifier node with no extra wrapper. Mirrors
        // format_statement listing a bare format directly. (M-1: the header
        // comment above promises this is supported.)
        alias($._input_bare_format, $.format_specifier),
      )),
      ';'
    ),

    // PUT -- write to log. PUT takes a list of items: quoted strings, variable
    // references, and the 'var=' shorthand (prints "var=<value>"). The shorthand
    // is NOT an expression (= is not an expression operator), so it gets a
    // dedicated arm. Also accepts array subscripts (grid{r,c}=) and formats.
    put_statement: $ => seq(
      alias($._put_keyword, 'put'),
      repeat1(choice(
        $.expression,
        seq($.identifier, '='),
        seq($.array_element, '='),
      )),
      ';'
    ),

    // SUM statement: target + expression (no '='). Accumulator: running_total + age;
    // Distinct from assignment (which has '=') and expression_statement (which
    // would mis-model it). Given precedence so it wins over expression_statement
    // for the 'identifier + expression' shape (G5).
    sum_statement: $ => prec(1, seq(
      field('target', $.identifier),
      '+',
      field('value', $.expression),
      ';'
    )),

    // KEEP / DROP -- variable selection
    // Variable lists may be macro variable references (&varlist), since a macro
    // may expand to a space-separated variable list (G-04).
    keep_statement: $ => seq(alias($._keep_keyword, 'keep'), repeat1(choice($.identifier, $.name_literal, $.macro_variable_reference)), ';'),
    drop_statement: $ => seq(alias($._drop_keyword, 'drop'), repeat1(choice($.identifier, $.name_literal, $.macro_variable_reference)), ';'),

    // RETAIN -- retain variables across iterations
    // Variables may be macro variable references (&depvar) in addition to plain
    // identifiers, since a macro may expand to a variable list.
    retain_statement: $ => seq(
      alias($._retain_keyword, 'retain'),
      repeat1(seq(choice($.identifier, $.name_literal, $.macro_variable_reference), optional($.expression))),
      ';'
    ),

    // LENGTH -- variable length declaration
    // The declared name may be a macro variable reference (&flagvar $1),
    // common in macros that generate column names (G-04). With VALIDVARNAME=ANY
    // the name may be a name literal ('subject id'n $10) (Task 6, Phase 0).
    // The width is an explicit $.number token so it stops at whitespace/';'
    // and cannot eat the terminating semicolon (Task 3, Phase 0). The '$' is
    // optional: `name $N` is a character variable, `name N` (bare numeric) is a
    // numeric variable -- SAS length allows both forms.
    length_statement: $ => seq(
      alias($._length_keyword, 'length'),
      // Each entry is a variable name followed by an OPTIONAL length spec.
      // SAS allows both per-variable widths (`length a $10 b $20;`) and a
      // shared trailing width that applies to the preceding list
      // (`length lastname firstname credential $20;`). Modeling the width as
      // optional on every entry handles both: in the shared form, earlier
      // names simply have no width attached and the trailing `$20` binds to
      // the last entry (tolerant — downstream tools resolve the shared scope).
      repeat1(seq(
        field('name', choice($.identifier, $.name_literal, $.macro_variable_reference)),
        optional(seq(optional('$'), $.number))
      )),
      ';'
    ),

    // FORMAT / INFORMAT -- variable format assignment
    // Accepts variable names (identifiers, name literals for VALIDVARNAME=ANY,
    // macro refs) and format specifiers. Named formats with a trailing dot
    // (yymmdd10., is8601da., $10., 8.2) are modeled by format_specifier, which
    // sequences the trailing '.' as $.missing_value to avoid lexical conflicts.
    //   format d yymmdd10.;   format a b $10.;   format x 8.2;
    //   informat rfstdtc is8601da.;
    format_statement: $ => seq(
      alias($._format_keyword, 'format'),
      repeat1(choice($.identifier, $.name_literal, $.macro_variable_reference, $.format_specifier)),
      ';'
    ),
    informat_statement: $ => seq(
      alias($._informat_keyword, 'informat'),
      repeat1(choice($.identifier, $.name_literal, $.macro_variable_reference, $.format_specifier)),
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

    // Standalone INPUT format with NO leading '$' (the subset of format_specifier
    // that can legally begin an INPUT repeat item without a preceding name).
    // Excludes the two '$'-leading arms so it never competes with the "name $"
    // arm. In the parse tree it is aliased to format_specifier for a uniform
    // consumer API (M-1: `input x yymmdd10.;`).
    _input_bare_format: $ => choice(
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
    // The dimension can be: a number/identifier/macro-ref (fixed), `*` (implicit),
    // comma-separated for multi-dim (grid{2,3}), or a bound range {-2:2}.
    // The element list accepts variable ranges (score1-score5) and _temporary_.
    // An optional initializer list may follow in parens, with comma-or-space
    // separated values including the missing value (.): (85, 90, .) or (1 2 3).
    array_statement: $ => seq(
      alias($._array_keyword, 'array'),
      $.identifier,
      optional(seq(
        choice('[', '{'),
        // Dimension list: numbers, macro-refs, or '*'. NOT identifiers -- a bare
        // identifier here is ambiguous with the element list that follows, and
        // real array dimensions are numeric or '*'. Bounds use ':' (lower:upper),
        // multi-dim uses ','. A leading '-' allows negative bounds (-2:2).
        optional('-'),
        repeat1(choice($.number, $.macro_variable_reference, '*', seq(':', $.number), ',')),
        choice(']', '}'),
      )),
      repeat1(choice(
        $.identifier,
        $.macro_variable_reference,
        seq($.identifier, '-', $.identifier),
      )),
      optional(seq('(', repeat(choice($.identifier, $.macro_variable_reference, $.number, $.missing_value, '*', ',')), ')')),
      ';'
    ),

    // HASH / HASH-ITERATOR object declaration:
    //   declare hash h(dataset: 'x', multidata: 'no');
    //   declare hiter ih('hh');
    // SAS hash objects use a constructor with tag:value arguments (note the ':'
    // not '='), and methods like h.find(), h.add_key(). The hash iterator
    // (declare hiter) takes the hash object name in parens. The declaration is
    // a DATA-step statement; method calls are handled as a method_call expression.
    hash_declaration_statement: $ => seq(
      'declare',
      choice('hash', 'hiter'),
      field('name', $.identifier),
      '(',
      repeat(seq(choice(
        seq($.identifier, ':', $.expression),
        $.quoted_string,
        $.identifier,
      ), optional(','))),
      ')',
      ';'
    ),

    // BY -- grouping variable
    // Variable lists may be macro variable references (G-04).
    by_statement: $ => seq(alias($._by_keyword, 'by'), repeat1(choice($.identifier, $.name_literal, $.macro_variable_reference)), ';'),

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
    //   value $sevfmt 'MILD'='Mild' 'MOD','MODERATE'='Moderate';
    //   invalue yn_num 'Y'=1 'N'=0 other=.;
    // The body is a series of value=label pairs terminated by ';'.
    // LHS: a single value (number/quoted_string/identifier) OR a range (X-Y,
    // optionally with exclusive '<' bound: 18-<40) OR a comma-separated list of
    // values ('MOD','MODERATE'). RHS: a label (quoted_string/number/missing_value/
    // identifier). The format name accepts a leading '$` for character formats
    // (the identifier token already permits a `$` prefix). Optional `(multilabel)`
    // style option lists may follow the format name (e.g. value agegrp (multilabel)).
    format_value_statement: $ => seq(
      choice('value', 'invalue', 'picture'),
      $.identifier,
      optional(seq('(', $.identifier, ')')),
      repeat1(seq(
        // Left-hand side: a value, a range, or a comma-separated list of values.
        choice(
          // Range X-Y with optional exclusive '<' bound (18-<40, 65-high, low-high, 'A'-'Z').
          seq(
            choice($.number, $.quoted_string, $.identifier),
            '-',
            optional('<'),
            choice($.number, $.quoted_string, $.identifier)
          ),
          // Single value or comma-separated list of values ('MOD','MODERATE').
          seq(
            choice($.number, $.quoted_string, $.identifier),
            repeat(seq(',', choice($.number, $.quoted_string, $.identifier)))
          ),
        ),
        '=',
        choice($.quoted_string, $.number, $.missing_value, $.identifier),      // label / value
        // Optional trailing option list, e.g. picture ... = 'fmt' (prefix='$').
        optional(seq('(', repeat1(choice($.identifier, $.quoted_string, $.number, '=')), ')'))
      )),
      ';'
    ),

    // Bare statement -- fallback for unrecognized statements (T-01-11: terminates at semicolon).
    // Only consumes raw tokens, not $.expression, to avoid ambiguity with statement dispatch.
    // Note: '/' (option separator) and arithmetic operators are intentionally NOT in this set.
    // '/' collides with the division operator in $.expression: adding it makes GLR commit to a
    // binary_expression parse that errors out and beats the bare_statement path (so `panelby a / b;`
    // still ERRORs). Arithmetic ops likewise let bare_statement outcompete assignment_statement
    // during error recovery. Typed sgplot_*_statement rules now accept parenthesized option values
    // via sgplot_option_list, handling `lineattrs=(...)` at the typed level instead (Task 4).
    bare_statement: $ => seq(
      choice($.identifier, $.name_literal),
      repeat(choice($.identifier, $.quoted_string, $.number, '(', ')', '=', ',', '.', '&', '/')),
      ';'
    ),

    // ========================================================================
    // PROC SQL sub-language rules (PARSE-07 -- SQL injection support)
    // These are unique named node types consumed by proc_body's choice().
    // ========================================================================

    // SELECT statement: complete query with optional FROM/WHERE/JOIN/GROUP BY/HAVING/ORDER BY.
    // In PROC SQL, SELECT ... FROM ... WHERE ... is ONE statement ending with a single ';'.
    // Supports set operations (UNION/INTERSECT/EXCEPT [ALL|CORR]) between queries.
    sql_select_statement: $ => seq(
      $._sql_select_query,
      repeat(seq(choice('union', 'intersect', 'except', 'outer union'), optional('all'), optional('corr'), $._sql_select_query)),
      ';'
    ),

    _sql_select_query: $ => seq(
      alias($._select_keyword, 'select'),
      optional('distinct'),
      $.sql_select_list,
      optional($.sql_into_clause),
      optional($.sql_from_clause),
      optional($.sql_where_clause),
      repeat($.sql_join_clause),
      optional($.sql_group_by_clause),
      optional($.sql_having_clause),
      optional($.sql_order_by_clause),
    ),

    // SELECT ... INTO :macrovar (separated by 'sep') -- PROC SQL macro-variable
    // assignment. Each target is a ':' + identifier (the SQL macro-variable
    // syntax uses a colon prefix, distinct from the & form used elsewhere),
    // optionally with a 'separated by' delimiter. E.g.:
    //   into :country_list separated by ', ', :n_list separated by ', '
    sql_into_clause: $ => seq(
      'into',
      repeat1(seq(
        seq(':', $.identifier),
        optional(seq('separated', 'by', $.quoted_string)),
        optional(','),
      )),
    ),

    sql_select_list: $ => repeat1(seq(
      // SELECT items may be a qualified column (b.x) which is matched via the
      // inline sql_select_item (a superset of sql_expression adding
      // sql_qualified_column) so it does NOT get split into
      // identifier+missing_value at the comma boundary. sql_qualified_column
      // lives ONLY here (not in the shared sql_expression) so WHERE/HAVING
      // operator expressions like `b.x > 1` still parse via expression's
      // binary/dotted path (I-1). sql_select_item is inline so plain
      // sql_expression items are not wrapped in an extra node.
      $.sql_select_item,
      optional(seq(alias($._as_keyword, 'as'), $.identifier)),
      // Column attributes after the alias: format=8.1, length=20, label='x'.
      repeat(seq($.identifier, '=', $.expression)),
      optional(',')
    )),

    // A SELECT-list item: sql_expression OR a qualified column (b.x). The
    // qualified column is lexed with token.immediate on '.member' so the '.' is
    // not reclaimed by missing_value (which matches '.x' and wins on length).
    sql_select_item: $ => choice(
      $.sql_qualified_column,
      $.sql_expression,
    ),

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
        choice($.identifier, $.name_literal),
        optional(seq('.', choice($.identifier, $.name_literal, $.macro_variable_reference))),
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
        seq(alias($._as_keyword, 'as'), $._sql_select_query, repeat(seq(choice('union', 'intersect', 'except', 'outer union'), optional('all'), optional('corr'), $._sql_select_query))),
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

    // Qualified star (a.*, b.*, lib.tbl.*) -- a NAMED node so SELECT a.* is
    // recognizable instead of being silently dropped. The '.*' is lexed as a
    // single immediate token (token.immediate(/\.\*/)) so the '.' is NOT
    // reclaimed by $.missing_value (token /\.[a-zA-Z]?/, which also matches '.*').
    // Without token.immediate, GLR early-reduces 'a' to an identifier and the
    // '.*' becomes a dropped missing_value -- the bug fixed in the review.
    sql_qualified_star: $ => prec(1, seq(
      choice($.identifier, $.macro_variable_reference, $.dotted_identifier),
      token.immediate(/\.\*/),
    )),

    // Qualified column reference in SQL (b.x, lib.tbl.col). A NAMED node so
    // SELECT b.x yields a recognizable qualified-column node instead of being
    // split into identifier(b)+missing_value(.x) at the comma/FROM list
    // boundary. The '.member' is lexed as a single immediate token so the '.'
    // is not reclaimed by $.missing_value (which matches '.x' and would win on
    // longest-match), exactly as sql_qualified_star does for '.*'.
    sql_qualified_column: $ => seq(
      field('base', choice($.identifier, $.macro_variable_reference, $.dotted_identifier)),
      field('member', token.immediate(seq('.', /[a-zA-Z_][a-zA-Z0-9_]*/))),
    ),

    sql_expression: $ => choice(
      $.sql_qualified_star,
      $.sql_case_expression,
      $.expression,
      '*',  // SELECT * wildcard
      seq($.expression, optional(seq(alias($._as_keyword, 'as'), $.identifier))),
    ),

    // Scalar subqueries (where x > (select avg(y) from t)) are handled by
    // parenthesized_expression, which accepts either a general expression or a
    // full _sql_select_query inside the parens. This avoids a separate
    // sql_scalar_subquery rule that would conflict with parenthesized_expression
    // at every '(' (G3).

    // SQL CASE expression: case when <cond> then <val> [when ...] [else <val>] end.
    // SAS PROC SQL supports both simple (case x when 1 then ...) and searched
    // (case when x=1 then ...) forms; we accept both via expression operands.
    sql_case_expression: $ => seq(
      'case',
      repeat1(seq(
        'when',
        $.sql_expression,
        'then',
        $.sql_expression,
      )),
      optional(seq('else', $.sql_expression)),
      'end',
    ),

    // ========================================================================
    // PROC MEANS / SUMMARY statements
    // ========================================================================

    means_var_statement: $ => seq(alias($._var_keyword, 'var'), repeat1(choice($.identifier, $.macro_variable_reference, seq($.identifier, '-', $.identifier))), ';'),
    means_class_statement: $ => seq('class', repeat1(choice($.identifier, $.macro_variable_reference)), optional($._class_slash_options), ';'),
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
      alias($._report_usage_keyword, $.report_usage_keyword),
      $.identifier,
      $.quoted_string,
      $.number,
      '=',
      $._report_style_attr,
      seq('(', repeat(choice($.identifier, $.number, '=', ',', $.quoted_string)), ')'),
      seq('[', repeat(choice($.identifier, $.number, '=', ',', $.quoted_string)), ']'),
      seq('{', repeat(choice($.identifier, $.number, '=', ',', $.quoted_string)), '}'),
    )), ';'),
    report_compute_statement: $ => seq('compute', $.identifier, optional(choice('before', 'after')), optional(seq('/', repeat1(choice($.identifier, seq($.identifier, '=', $.number))))), ';', repeat($.statement), 'endcomp', ';'),
    report_break_statement: $ => seq('break', choice('before', 'after'), $.identifier, '/', repeat1(choice($.identifier, $._report_style_attr)), ';'),
    report_rbreak_statement: $ => seq('rbreak', choice('before', 'after'), '/', repeat1(choice($.identifier, $._report_style_attr)), ';'),
    report_order_statement: $ => seq('order', repeat1($.identifier), ';'),

    // PROC REPORT style attribute: style(column)={...} or style=[...] or style={...}.
    // The optional (location) classifies the style target (column/header/summary);
    // the value group may use {}, [], or () braces with key=value pairs. Reused by
    // define/break/rbreak slash-options (G9).
    _report_style_attr: $ => prec(1, seq(
      'style',
      optional(seq('(', repeat(choice($.identifier, '=')), ')')),
      choice(
        seq('=', '{', repeat(choice($.identifier, $.number, $.quoted_string, '=', ',')), '}'),
        seq('=', '[', repeat(choice($.identifier, $.number, $.quoted_string, '=', ',')), ']'),
        seq('=', '(', repeat(choice($.identifier, $.number, $.quoted_string, '=', ',')), ')'),
      ),
    )),

    // Token: PROC REPORT DEFINE usage keywords (case-insensitive).
    // Aliased to a named 'report_usage_keyword' node when used inside
    // report_define_statement slash-options, so display/group/analysis/across/
    // order/computed highlight distinctly from generic identifiers.
    _report_usage_keyword: $ => /[dD][iI][sS][pP][lL][aA][yY]|[gG][rR][oO][uU][pP]|[aA][nN][aA][lL][yY][sS][iI][sS]|[aA][cC][rR][oO][sS][sS]|[oO][rR][dD][eE][rR]|[cC][oO][mM][pP][uU][tT][eE][dD]/,

    // LINE -- output statement, valid inside COMPUTE blocks.
    //   line @5 name $20.;
    //   line "Total: " sumvar;
    //   line @10 region;
    // Supports @N column pointers, quoted strings, identifiers/variables,
    // numbers, and macro variable references. The dot-format (age.dollar8.)
    // and informat ($charN.) parse loosely via the identifier/dot fallback.
    report_line_statement: $ => seq(
      'line',
      repeat1(choice(
        seq('@', $.number),                       // @5 column pointer
        $.quoted_string,
        $.identifier,
        $.number,
        $.macro_variable_reference,
        seq('$', $.number, $.missing_value),       // $9. character format
        $.format_specifier,                        // yymmdd10. etc.
      )),
      ';'
    ),

    // ========================================================================
    // PROC TABULATE statements
    // ========================================================================

    tabulate_class_statement: $ => seq('class', repeat1(choice($.identifier, $.macro_variable_reference)), optional($._class_slash_options), ';'),
    tabulate_classlev_statement: $ => seq('classlev', repeat1($.identifier), ';'),
    tabulate_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference, seq($.identifier, '-', $.identifier))), ';'),
    // PROC TABULATE TABLE statement -- a crossed/composed expression DSL:
    //   table (trt01p all='Total'), (aesev all='Any AE')*n=' '*f=3.0 age*(mean='Mean Age' std='SD')*f=8.1;
    // The DSL uses '*' (cross), ',' (page/dimension separator), parenthesized
    // groups with embedded label assignments (all='Total'), statistic-with-label
    // (n=' '), and format application (*f=8.1). Full structural modeling of this
    // DSL is genuinely ambiguous with expression/function-call and risks parser
    // explosion, so we use a TOLERANT token-list form: accept the TABULATE token
    // set flatly (identifiers, quoted strings, numbers, '*', ',', '=', '(', ')',
    // ':', format_specifier) as a single repeat. This sacrifices CST precision
    // for TABLE expressions but achieves zero-error parsing (G10 fallback).
    tabulate_table_statement: $ => seq('table', repeat1(choice(
      $.identifier,
      $.quoted_string,
      $.number,
      $.format_specifier,
      $.macro_variable_reference,
      '*', ',', '=', '(', ')', ':', '/',
    )), ';'),
    tabulate_keylabel_statement: $ => seq('keylabel', repeat1(seq($.identifier, '=', $.quoted_string)), ';'),
    tabulate_format_statement: $ => seq('format', repeat1(seq($.identifier, $.identifier)), ';'),

    // ========================================================================
    // PROC PRINT statements
    // ========================================================================

    print_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference, seq($.identifier, '-', $.identifier))), ';'),
    print_id_statement: $ => seq('id', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    print_sum_statement: $ => seq('sum', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    print_pageby_statement: $ => seq('pageby', choice($.identifier, $.macro_variable_reference), ';'),

    // ========================================================================
    // PROC TRANSPOSE statements
    // ========================================================================

    transpose_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference, seq($.identifier, '-', $.identifier))), ';'),
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

    // NOTE: PROC IMPORT/EXPORT options are parsed on the header line via
    // proc_options/proc_option_key. The body-statement forms below handle the
    // multi-line style the SAS IMPORT/EXPORT wizard generates:
    //   proc import datafile="x.csv" out=work.x dbms=csv replace;
    //     guessingrows=200;
    //     datarow=2;
    //     getnames=yes;
    //   run;
    // Each option as its own `key = value ;` statement in the proc body.
    import_datarow_statement: $ => seq(alias($._datarow_keyword, 'datarow'), '=', $.number, ';'),
    import_getnames_statement: $ => seq(alias($._getnames_keyword, 'getnames'), '=', $.identifier, ';'),
    import_guessingrows_statement: $ => seq(alias($._guessingrows_keyword, 'guessingrows'), '=', $.number, ';'),
    import_sheet_statement: $ => seq(alias($._sheet_keyword, 'sheet'), '=', $.quoted_string, ';'),
    import_range_statement: $ => seq(alias($._range_keyword, 'range'), '=', $.quoted_string, ';'),
    export_label_statement: $ => seq(alias($._label_keyword, 'label'), '=', $.identifier, ';'),
    export_putnames_statement: $ => seq(alias($._putnames_keyword, 'putnames'), '=', $.identifier, ';'),

    // ========================================================================
    // PROC FCMP function/subroutine blocks
    // ========================================================================
    // FCMP defines reusable functions/subroutines in a block form:
    //   function bmi_calc(weight_kg, height_m);
    //     if height_m <= 0 then return (.);
    //     return (weight_kg / (height_m ** 2));
    //   endsub;
    //   subroutine flag_outlier(value, lo, hi, outflag);
    //     outargs outflag;
    //     ...
    //   endsub;
    // The body reuses $.statement (so if/else/assignment/length/etc. all work)
    // plus an fcmp_outargs_statement and fcmp_return_statement. The optional
    // `$type` after the function name models the return-type annotation
    // (`function bmi_class(bmi_value) $12;`).

    fcmp_function_block: $ => seq(
      'function',
      field('name', $.identifier),
      field('params', optional(seq('(', repeat(choice($.identifier, ',', $.macro_variable_reference)), ')'))),
      optional(seq('$', $.number)),                       // return-type width: $12
      ';',
      repeat(choice(
        $.fcmp_return_statement,
        $.fcmp_outargs_statement,
        $.statement,
      )),
      'endsub', ';'
    ),

    fcmp_subroutine_block: $ => seq(
      'subroutine',
      field('name', $.identifier),
      field('params', optional(seq('(', repeat(choice($.identifier, ',', $.macro_variable_reference)), ')'))),
      optional(seq('$', $.number)),
      ';',
      repeat(choice(
        $.fcmp_return_statement,
        $.fcmp_outargs_statement,
        $.statement,
      )),
      'endsub', ';'
    ),

    // FCMP return: `return (expr);`. Distinct from base-SAS return because FCMP
    // requires parens around the value and lives only inside a function/
    // subroutine block.
    fcmp_return_statement: $ => seq('return', '(', $.expression, ')', ';'),

    // FCMP outargs: declares which parameters are output (modified in place).
    fcmp_outargs_statement: $ => seq('outargs', repeat1($.identifier), ';'),

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
    compare_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference, seq($.identifier, '-', $.identifier))), ';'),
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
    datasets_delete_statement: $ => seq('delete', repeat1(choice($.identifier, $.macro_variable_reference)), optional($._class_slash_options), ';'),

    // Shared slash-options group for CLASS/DELETE statements: /order=data,
    // /memtype=data, /missing, /key=value. A flat repeat of identifiers and
    // key=value pairs after a '/'. Reused by means/tabulate/univariate class
    // statements and datasets_delete (G11).
    _class_slash_options: $ => seq('/', repeat1(choice($.identifier, seq($.identifier, '=', $.expression)))),
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

    univariate_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference, seq($.identifier, '-', $.identifier))), ';'),
    univariate_class_statement: $ => seq('class', repeat1(choice($.identifier, $.macro_variable_reference)), optional($._class_slash_options), ';'),
    univariate_freq_statement: $ => seq('freq', choice($.identifier, $.macro_variable_reference), ';'),
    univariate_weight_statement: $ => seq('weight', choice($.identifier, $.macro_variable_reference), ';'),
    univariate_id_statement: $ => seq('id', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_histogram_statement: $ => seq('histogram', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_probplot_statement: $ => seq('probplot', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_qqplot_statement: $ => seq('qqplot', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
    univariate_cdfplot_statement: $ => seq('cdfplot', repeat1(choice($.identifier, $.macro_variable_reference)), ';'),
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
    reg_var_statement: $ => seq('var', repeat1(choice($.identifier, $.macro_variable_reference, seq($.identifier, '-', $.identifier))), ';'),
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
    // _sgplot_optval: an option value. SAS SGPLOT statements accept parenthesized
    // option lists as values, e.g. lineattrs=(thickness=2), markerattrs=(symbol=X
    // size=8), values=(1 2 3). Without this arm the typed sgplot_*_statement rules
    // die at the '(' and the parse ERRORs to EOF (Task 4).
    _sgplot_optval: $ => choice($.identifier, $.quoted_string, $.number, $.function_call, $.sgplot_option_list),
    sgplot_option_list: $ => seq('(', repeat(choice($.identifier, $.quoted_string, $.number, '=', ',', '+', '-', '*', '/')), ')'),

    sgplot_scatter_statement: $ => seq('scatter', 'x', '=', $.identifier, 'y', '=', $.identifier, repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_series_statement: $ => seq('series', 'x', '=', $.identifier, 'y', '=', $.identifier, repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_vbar_statement: $ => seq('vbar', $.identifier, repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_hbar_statement: $ => seq('hbar', $.identifier, repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_histogram_statement: $ => seq('histogram', $.identifier, repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_density_statement: $ => seq('density', $.identifier, repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_boxplot_statement: $ => seq('boxplot', 'y', '=', $.identifier, repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_reg_statement: $ => seq('reg', 'x', '=', $.identifier, 'y', '=', $.identifier, repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_band_statement: $ => seq('band', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_needle_statement: $ => seq('needle', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_refline_statement: $ => seq('refline', repeat1($.expression), repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_xaxis_statement: $ => seq('xaxis', repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_yaxis_statement: $ => seq('yaxis', repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_keylegend_statement: $ => seq('keylegend', optional($.identifier), repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_inset_statement: $ => seq('inset', repeat1(choice($.identifier, $.quoted_string)), repeat(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier)), optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))), ';'),
    sgplot_title_statement: $ => seq('title', $.expression, ';'),
    sgplot_footnote_statement: $ => seq('footnote', $.expression, ';'),

    // GTL (PROC TEMPLATE) statements -- the Graph Template Language sub-language.
    // Full GTL modeling (300+ statements) is out of scope; these tolerant rules
    // cover the common plot/header forms so proc template bodies parse cleanly.
    // gtl_plot_statement handles seriesplot/scatterplot/boxplot/etc. with x=/y=
    // and /options; gtl_define_statement handles 'define statgraph x;' (distinct
    // from report_define_statement which expects a '/'). Other GTL keywords
    // (begingraph, endgraph, layout, endlayout, dynamic, entrytitle, end) fall
    // through to bare_statement, which already tolerates them (G13).
    gtl_plot_statement: $ => prec(1, seq(
      choice('seriesplot', 'scatterplot', 'barchart', 'piechart', 'referenceline', 'scatterplotmatrix', 'modelband', 'stepplet'),
      repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)),
      optional(seq('/', repeat1(choice(seq($.identifier, '=', $._sgplot_optval), $.identifier, $.quoted_string)))),
      ';'
    )),
    gtl_define_statement: $ => prec(1, seq('define', 'statgraph', $.identifier, ';')),

    // ========================================================================
    // Expression supertype with operator precedence (PARSE-01, T-01-04)
    // ========================================================================

    expression: $ => choice(
      $.binary_expression,
      $.unary_expression,
      $.parenthesized_expression,
      $.function_call,
      $.method_call,
      $.macro_variable_reference,
      // Macro quoting function as an argument value: %str(,) passed to a SAS
      // function via %sysfunc(countw(&list, %str(,))). Valid in expression
      // positions so nested function args accept quoting (G6).
      $.macro_quoting_function,
      // Array element: arr[i], _v{id}, x(j) -- common in DATA step expressions.
      $.array_element,
      // Dotted identifier: first.varname, last.varname, lib.dataset etc.
      // SAS uses this pattern extensively for BY-group indicators and
      // qualified references (lib.dataset) in expressions. Given precedence so
      // that "a.b" is not split into identifier(a)+missing_value(.b) at
      // list/boundary positions (e.g. SELECT a.b, ...).
      $.dotted_identifier,
      $.identifier,
      $.quoted_string,
      // SAS name literal (VALIDVARNAME=ANY): 'my var'n
      $.name_literal,
      // SAS numeric missing value (. or .a-.z)
      $.missing_value,
      $.number,
    ),

    // Array element access: name[expr], name{expr}.
    // SAS accepts [], {}, and () for array subscripting, but () is also the
    // function-call syntax. We restrict array_element to [] and {} to avoid
    // a pervasive conflict with function_call; x(j) parses as a function_call.
    // Multi-dimensional subscripts use comma-separated indices: grid{r,c}.
    array_element: $ => prec(1, seq(
      field('array', $.identifier),
      choice('[', '{'),
      field('index', $.expression),
      repeat(seq(',', $.expression)),
      choice(']', '}'),
    )),

    // Dotted identifier -- two identifiers (or macro refs) joined by a dot.
    // Used for SAS BY-group indicators (first.USUBJID, last.LBTEST),
    // qualified references (lib.dataset, work.&contds), and other dotted-name
    // patterns. Either side may be a macro variable reference (G-11d).
    // Given higher precedence than method_call (prec 2) so lib.dataset binds as
    // a dotted reference first; method_call only wins when '(' follows AND the
    // dotted_identifier cannot form a complete unit (G4).
    dotted_identifier: $ => prec(3, seq(
      field('base', choice($.identifier, $.macro_variable_reference)),
      '.',
      field('member', choice($.identifier, $.name_literal, $.macro_variable_reference)),
    )),

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
      // Comparison operators (symbolic and word forms: = ^= ~= <= >= < > eq ne gt lt ge le)
      prec.left(1, seq(field('left', $.expression), field('operator', choice('=', '^=', '~=', '<=', '>=', '<', '>', 'eq', 'ne', 'gt', 'lt', 'ge', 'le')), field('right', $.expression))),
      // IN operator
      prec.left(1, seq(field('left', $.expression), field('operator', 'in'), field('right', $.expression))),
      // BETWEEN x AND y operator (SAS/SQL): a.age between 40 and 64
      prec.left(1, seq(field('left', $.expression), 'between', field('right', $.expression), 'and', field('right', $.expression))),
      // IS [NOT] MISSING / IS NULL: where a.age is not missing
      prec.left(1, seq(field('left', $.expression), 'is', optional('not'), choice('missing', 'null'))),
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

    parenthesized_expression: $ => seq('(', choice($.expression, $._sql_select_query), ')'),

    function_call: $ => seq(
      field('name', $.identifier),
      '(',
      repeat(seq(choice($.expression, '*'), optional(','))),
      ')',
    ),

    // Method call on a hash/Java object: h.find(), h2.add_key('a'), obj.setValue(x).
    // Distinct from function_call (dotted object.method name) and from a dataset
    // reference (lib.dataset(options)): the args are expressions, not key=value
    // options. Given precedence so it wins over dotted_identifier + data_set_option
    // when '(' follows, but only in expression positions (G4).
    method_call: $ => prec(2, seq(
      field('object', $.identifier),
      '.',
      field('method', $.identifier),
      '(',
      repeat(seq(choice($.expression, '*'), optional(','))),
      ')',
    )),

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
      $.include_statement,
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
      field('name', $.identifier),
      repeat(choice(
        seq($.identifier, '=', choice($.identifier, $.number, $.quoted_string, $.macro_variable_reference)),
        // Bare identifier arm: accepts engine names (`libname xlout xlsx "..."`)
        // and the `clear`/`list`/`_all_` deassignment forms
        // (`libname xlout clear;`, `libname _all_ list;`). Mirrors the
        // filename_statement bare-identifier arm.
        $.identifier,
        $.quoted_string,
        $.macro_variable_reference,
      )),
      ';'
    ),

    // FILENAME -- external file reference with optional path and options.
    //   filename dump "%sysfunc(pathname(work))/dump.txt" lrecl=200;
    //   filename myref "c:/temp/data.txt";
    //   filename syspipe pipe 'echo hello';   (pipe/disk/terminal device types
    //   are bare identifiers with no '=', so a bare-identifier arm is needed).
    filename_statement: $ => seq(
      alias($._filename_keyword, 'filename'),
      field('name', $.identifier),
      repeat(choice(
        seq($.identifier, '=', choice($.identifier, $.number, $.quoted_string, $.macro_variable_reference)),
        $.identifier,
        $.quoted_string,
        $.macro_variable_reference,
      )),
      ';'
    ),

    // %INCLUDE -- include an external SAS file. Forms:
    //   %include "path/file.sas";
    //   %include "&macrovar/file.sas" /source2;
    //   %include fileref;
    // Reuses the existing _include_keyword token (previously orphaned),
    // which matches both %include and the %inc abbreviation.
    include_statement: $ => seq(
      alias($._include_keyword, '%include'),
      repeat1(choice($.quoted_string, $.identifier, $.macro_variable_reference)),
      optional(seq('/', repeat1($.identifier))),  // options: /source2 /nosource2 ...
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

    // TITLE/FOOTNOTE with leading key=value options: title1 justify=left "Protocol";
    // The options (justify=, height=, color=, bold, italic) precede the text.
    // Accept a repeat of identifier=value pairs before the optional text expr (G11).
    title_statement: $ => seq(alias($._title_keyword, 'title'), repeat(seq($.identifier, '=', $.expression)), optional($.expression), ';'),
    footnote_statement: $ => seq(alias($._footnote_keyword, 'footnote'), repeat(seq($.identifier, '=', $.expression)), optional($.expression), ';'),
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

    // SAS name literal (VALIDVARNAME=ANY): 'my var'n or "my var"n
    // A quoted string immediately followed by 'n'. Used as a variable/dataset
    // name when the name contains spaces or special characters.
    // prec(2) wins over quoted_string (single/double_quoted_string, which sit at
    // default precedence). Tree-sitter longest-match-wins would already prefer
    // the longer token, but the explicit precedence guarantees name_literal is
    // selected whenever a name position accepts it (assignment target, dataset
    // name, variable lists, etc.) so the lexer commits to the trailing 'n'.
    name_literal: $ => token(prec(2, seq(
      choice(
        seq("'", /([^']|'')*/, "'"),
        seq('"', /([^"]|"")*/, '"')
      ),
      'n'
    ))),

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
    _macro_by_keyword: $ => /%[bB][yY]/,
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
    // Matches %include and the %inc abbreviation (case-insensitive).
    // token(prec(1, ...)) ensures the lexer matches the full %include keyword
    // as one token, winning over the generic '%' + identifier split that
    // macro_call_statement would otherwise consume.
    _include_keyword: $ => token(prec(1, /%[iI][nN][cC]([lL][uU][dD][eE])?/)),
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
    // Macro-state helpers and control keywords (G7): %SYMGET resolves a macro
    // variable; %SYSMACEEXIST/%SYMEXIST-style existence checks; %SUPERQ masks a
    // name; %ABORT terminates macro execution (optionally with an action arg).
    _macro_symget_keyword: $ => /%[sS][yY][mM][gG][eE][tT]/,
    _macro_sysmacexist_keyword: $ => /%[sS][yY][sS][mM][aA][cC][eE][xX][iI][sS][tT]/,
    _macro_superq_keyword: $ => /%[sS][uU][pP][eE][rR][qQ]/,
    _macro_abort_keyword: $ => /%[aA][bB][oO][rR][tT]/,

    // --- PROC SQL keywords ---
    _select_keyword: $ => /[sS][eE][lL][eE][cC][tT]/,
    _from_keyword: $ => /[fF][rR][oO][mM]/,
    _join_keyword: $ => /[jJ][oO][iI][nN]/,
    _on_keyword: $ => /[oO][nN]/,
    _as_keyword: $ => /[aA][sS]/,
    _having_keyword: $ => /[hH][aA][vV][iI][nN][gG]/,
    _into_keyword: $ => /[iI][nN][tT][oO]/,
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
    _putnames_keyword: $ => /[pP][uU][tT][nN][aA][mM][eE][sS]/,
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
