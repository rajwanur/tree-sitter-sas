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
    // copy_options vs copy_option_key: same family as the proc_options conflict
    // above. With copy_option's '= value' optional, after 'proc copy ident' the
    // parser cannot tell whether a following identifier is a second bare flag or
    // the value of the first (e.g. 'proc copy in out' = two flags vs in=out-shape).
    // GLR explores both; the '= value' presence decides (Phase 3 B1).
    [$.copy_options, $.copy_option_key],
    // cport_options vs cport_option_key: same family as the copy_options
    // conflict above (Phase 3 B2).
    [$.cport_options, $.cport_option_key],
    // cimport_options vs cimport_option_key: same family as the copy/cport
    // conflicts above (Phase 3 B3).
    [$.cimport_options, $.cimport_option_key],
    // cimport_option_flag vs cimport_option_key: several CIMPORT options are
    // valid both as a bare flag (force/upcase/new/sort/compress) and as a
    // key=value (compress=/new=/sort=/upcase=). At 'proc cimport compress ident'
    // GLR cannot tell whether 'compress' is a flag (ident is the next option) or
    // a key (ident is its value). Same family as the option conflicts above.
    [$.cimport_option_flag, $.cimport_option_key],
    // sort_options vs sort_option_key: same family as the copy/cport/cimport
    // option conflicts above (Phase 3 C1).
    [$.sort_options, $.sort_option_key],
    // datasets_options vs datasets_option_key: same family as the copy/cport/
    // cimport/sort option conflicts above (Phase 3 C2 / Task 12).
    [$.datasets_options, $.datasets_option_key],
    // append_options vs append_option_key: same family as the copy/cport/cimport/
    // sort/datasets option conflicts above (Phase 3 C3 / Task 13).
    [$.append_options, $.append_option_key],
    // standard_options vs standard_option_key: same family as the copy/cport/
    // cimport/sort/datasets/append option conflicts above (Phase 3 C3 / Task 14).
    [$.standard_options, $.standard_option_key],
    // printto_options vs printto_option_key: same family as the copy/cport/cimport/
    // sort/datasets/append/standard option conflicts above (Phase 3 C3 / Task 15).
    [$.printto_options, $.printto_option_key],
    // transpose_options vs transpose_option_key: same family as the copy/cport/cimport/
    // sort/datasets/append/standard/printto option conflicts above (Phase 3 C3 / Task 16).
    [$.transpose_options, $.transpose_option_key],
    // contents_options vs contents_option_key: same family as the copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose option conflicts above (Phase 3 C3 / Task 17).
    [$.contents_options, $.contents_option_key],
    // compare_options vs compare_option_key: same family as the copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents option conflicts above
    // (Phase 3 C3 / Task 18).
    [$.compare_options, $.compare_option_key],
    // freq_options vs freq_option_key: same family as the copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents/compare option conflicts
    // above (Phase 3 C3 / Task 22).
    [$.freq_options, $.freq_option_key],
    // options_options vs options_option_key: same family as the copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents/compare/freq option
    // conflicts above (Phase 3 C3 / Task 19).
    [$.options_options, $.options_option_key],
    // print_options vs print_option_key: same family as the copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents/compare/freq/options
    // option conflicts above (Phase 3 C3 / Task 20).
    [$.print_options, $.print_option_key],
    // means_options vs means_option_key: same family as the
    // copy/cport/cimport/sort/datasets/append/standard/printto/transpose/contents/
    // compare/freq/options/print option conflicts above (Phase 3 C3 / Task 21).
    [$.means_options, $.means_option_key],
    // proc_body: repeat1(choice(...)) cannot tell whether an identifier
    // starts a new statement inside the proc body or is a new step outside.
    // Also, run/quit can match as bare_statement or as the step terminator.
    [$.proc_body],
    // proc_step was a single rule with an optional proc_body (the original
    // [$.proc_step] conflict). proc_step is now a choice() dispatcher, so the
    // ambiguity moved into each per-proc *_step rule below. The generic fallback
    // (proc_generic_step) and proc_copy_step each carry the same bounded
    // single-rule optional-body ambiguity.
    [$.proc_copy_step],
    // proc_cport_step: same optional-body ambiguity as proc_copy_step (Phase 3 B2).
    [$.proc_cport_step],
    // proc_cimport_step: same optional-body ambiguity as proc_copy/cport (Phase 3 B3).
    [$.proc_cimport_step],
    // proc_sort_step: same optional-body ambiguity as proc_copy/cport/cimport (Phase 3 C1).
    [$.proc_sort_step],
    // proc_datasets_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort (Phase 3 C2 / Task 12).
    [$.proc_datasets_step],
    // proc_append_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets (Phase 3 C3 / Task 13).
    [$.proc_append_step],
    // proc_standard_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets/append (Phase 3 C3 / Task 14).
    [$.proc_standard_step],
    // proc_printto_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets/append/standard (Phase 3 C3 / Task 15).
    [$.proc_printto_step],
    // proc_transpose_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets/append/standard/printto (Phase 3 C3 / Task 16).
    [$.proc_transpose_step],
    // proc_contents_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose (Phase 3 C3 / Task 17).
    [$.proc_contents_step],
    // proc_compare_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents (Phase 3 C3 / Task 18).
    [$.proc_compare_step],
    // proc_freq_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents/compare (Phase 3 C3 / Task 22).
    [$.proc_freq_step],
    // proc_options_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents/compare/freq (Phase 3 C3 / Task 19).
    [$.proc_options_step],
    // proc_print_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents/compare/freq/options (Phase 3 C3 / Task 20).
    [$.proc_print_step],
    // proc_means_step: same optional-body ambiguity as proc_copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents/compare/freq/options/print (Phase 3 C3 / Task 21).
    [$.proc_means_step],
    // proc_generic_step: the optional proc_body now lives here (the original
    // proc_step body, moved when proc_step became a dispatcher).
    [$.proc_generic_step],
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
    // tabulate vs univariate have identical rule shapes (seq('class', repeat1, optional slash, ';'))
    // and the 3/4-way groups above don't cover their pairwise continuation conflict after ';'.
    [$.tabulate_class_statement, $.univariate_class_statement],
    // logistic_class_statement's repeat1 (parenthesized option group) collides with itself
    // at the continuation after the group; single-element conflict declaration resolves it.
    [$.logistic_class_statement],
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
    // (Removed [ttest_paired_statement, expression] and [lifetest_time_statement, expression] —
    // tree-sitter reports them unnecessary: the expression supertype's binary '*' arm already
    // subsumes the var*var forms these guarded against.)
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
    [$.reg_options, $.reg_option_key],
    [$.proc_reg_step],
    [$.glm_options, $.glm_option_key],
    [$.proc_glm_step],
    [$.mixed_options, $.mixed_option_key],
    [$.proc_mixed_step],
    [$.anova_options, $.anova_option_key],
    [$.proc_anova_step],
    [$.phreg_options, $.phreg_option_key],
    [$.proc_phreg_step],
    [$.genmod_options, $.genmod_option_key],
    [$.proc_genmod_step],
    [$.factor_options, $.factor_option_key],
    [$.proc_factor_step],
    [$.princomp_options, $.princomp_option_key],
    [$.proc_princomp_step],
    [$.logistic_options, $.logistic_option_key],
    [$.proc_logistic_step],
    [$.ttest_options, $.ttest_option_key],
    [$.proc_ttest_step],
    [$.lifetest_options, $.lifetest_option_key],
    [$.proc_lifetest_step],
    [$.univariate_options, $.univariate_option_key],
    [$.proc_univariate_step],
    [$.sgplot_options, $.sgplot_option_key],
    [$.proc_sgplot_step],
    [$.gplot_options, $.gplot_option_key],
    [$.proc_gplot_step],
    [$.format_options, $.format_option_key],
    [$.proc_format_step],
    [$.fcmp_options, $.fcmp_option_key],
    [$.proc_fcmp_step],
    [$.sql_options, $.sql_option_key],
    [$.proc_sql_step],
    [$.report_options, $.report_option_key],
    [$.proc_report_step],
    [$.tabulate_options, $.tabulate_option_key],
    [$.proc_tabulate_step],
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

    // --- Per-proc structs (Phase 3 B-D) ---
    // proc_step dispatches on the proc-name token to a per-proc *_step rule.
    // Each per-proc rule has its own typed *_option_key (that proc's valid
    // options only), falling back to $.identifier for unknown keys. The body
    // (proc_body) stays shared across all PROCs.

    // Dispatcher: routes on the proc-name token. Each per-proc *_step rule has
    // typed options; proc_generic_step is the fallback preserving the original
    // shared-proc_options behavior for any PROC not yet converted.
    //
    // The per-proc arms carry prec(1) so they win the GLR tie at 'proc <name>'
    // where <name> is both a valid keyword token (e.g. _proc_copy_keyword) and a
    // valid identifier (proc_generic_step's proc_name -> identifier). Without
    // this, the generic arm (identifier matches 'copy') would win and the
    // per-proc struct would never be produced.
    proc_step: $ => choice(
      prec(1, $.proc_copy_step),
      prec(1, $.proc_cport_step),
      prec(1, $.proc_cimport_step), // Phase B3
      prec(1, $.proc_sort_step), // Phase C1
      prec(1, $.proc_datasets_step), // Phase C2 (Task 12)
      prec(1, $.proc_append_step), // Phase C3 (Task 13)
      prec(1, $.proc_standard_step), // Phase C3 (Task 14)
      prec(1, $.proc_printto_step), // Phase C3 (Task 15)
      prec(1, $.proc_transpose_step), // Phase C3 (Task 16)
      prec(1, $.proc_contents_step), // Phase C3 (Task 17)
      prec(1, $.proc_compare_step), // Phase C3 (Task 18)
      prec(1, $.proc_freq_step), // Phase C3 (Task 22)
      prec(1, $.proc_options_step), // Phase C3 (Task 19)
      prec(1, $.proc_print_step), // Phase C3 (Task 20)
      prec(1, $.proc_means_step), // Phase C3 (Task 21)
      prec(1, $.proc_reg_step), // Phase 3 D
      prec(1, $.proc_glm_step), // Phase 3 D
      prec(1, $.proc_mixed_step), // Phase 3 D
      prec(1, $.proc_anova_step), // Phase 3 D
      prec(1, $.proc_phreg_step), // Phase 3 D
      prec(1, $.proc_genmod_step), // Phase 3 D
      prec(1, $.proc_factor_step), // Phase 3 D
      prec(1, $.proc_princomp_step), // Phase 3 D
      prec(1, $.proc_logistic_step), // Phase 3 D
      prec(1, $.proc_ttest_step), // Phase 3 D
      prec(1, $.proc_lifetest_step), // Phase 3 D
      prec(1, $.proc_univariate_step), // Phase 3 D
      prec(1, $.proc_sgplot_step), // Phase 3 D
      prec(1, $.proc_gplot_step), // Phase 3 D
      prec(1, $.proc_format_step), // Phase 3 D
      prec(1, $.proc_fcmp_step), // Phase 3 D
      prec(1, $.proc_sql_step), // Phase 3 D
      prec(1, $.proc_report_step), // Phase 3 D
      prec(1, $.proc_tabulate_step), // Phase 3 D

      $.proc_generic_step,
    ),

    // PROC COPY: in=/out=/memtype= options plus boolean flags (move, force, ...).
    // The proc name is emitted as the alias($._proc_copy_keyword,'copy') token;
    // it is NOT also captured as field('name',...) to avoid a redundant alias
    // conflicting with the generic proc_name path. The linter reads the name
    // from the step node type (proc_copy_step -> 'copy') via inferProcNameFromStep.
    proc_copy_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_copy_keyword, 'copy'),
      optional(field('options', $.copy_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    copy_options: $ => repeat1(choice(
      $.copy_option,
      $.copy_option_flag,
      $.identifier,
    )),

    // key = value  (e.g. in=work, out=staging, memtype=data) OR key with a
    // parenthesized arg group. Mirrors proc_option's shape but with
    // copy_option_key (the COPY-only keyword set).
    copy_option: $ => seq(
      $.copy_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A COPY option keyword with no value (boolean flag), e.g. move / force /
    // clone / noaccel. Aliased to a named node for highlighting/linting.
    copy_option_flag: $ => alias(choice(
      $._replace_keyword, $._label_keyword,
      $._accel_keyword, $._noaccel_keyword,
      $._clone_keyword, $._noclone_keyword,
      $._force_keyword, $._move_keyword, $._datecopy_keyword,
    ), 'copy_option_flag'),

    // Option key: known COPY keywords (aliased so they appear as anonymous
    // keyword nodes for highlighting) OR a generic identifier (unknown key,
    // which the linter may flag as invalid for COPY).
    copy_option_key: $ => choice(
      alias($._in_keyword, 'in'),
      alias($._out_keyword, 'out'),
      alias($._memtype_keyword, 'memtype'),
      alias($._index_keyword, 'index'),
      alias($._constraint_keyword, 'constraint'),
      alias($._encryptkey_keyword, 'encryptkey'),
      alias($._override_keyword, 'override'),
      alias($._alter_keyword, 'alter'),
      $.identifier,
    ),

    // PROC CPORT: library=/file=/memtype=/catalog=/data=/index=/constraint=/
    // after=/eet=/et=/generation=/intype=/outlib=/outtype= value options plus
    // boolean flags (asis, nocompress, noedit, nosrc, tape, translate, datecopy).
    // Same shape as proc_copy_step; the proc name is emitted as the
    // alias($._proc_cport_keyword,'cport') token (no field('name')) and the
    // linter reads the name via inferProcNameFromStep (Phase 3 B2).
    proc_cport_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_cport_keyword, 'cport'),
      optional(field('options', $.cport_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    cport_options: $ => repeat1(choice(
      $.cport_option,
      $.cport_option_flag,
      $.identifier,
    )),

    // key = value (e.g. library=work, file=x, memtype=data, catalog=...) OR key
    // with a parenthesized arg group. Mirrors proc_option/copy_option's shape.
    cport_option: $ => seq(
      $.cport_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A CPORT option keyword with no value (boolean flag), e.g. asis / tape /
    // translate / noedit / nosrc / nocompress / datecopy. Aliased to a named
    // node for highlighting/linting.
    cport_option_flag: $ => alias(choice(
      $._asis_keyword, $._nocompress_keyword, $._noedit_keyword,
      $._nosrc_keyword, $._tape_keyword, $._translate_keyword,
      $._datecopy_keyword,
    ), 'cport_option_flag'),

    // Option key: known CPORT keywords (aliased so they appear as anonymous
    // keyword nodes for highlighting) OR a generic identifier (unknown key,
    // which the linter may flag as invalid for CPORT).
    cport_option_key: $ => choice(
      alias($._library_keyword, 'library'),
      alias($._file_keyword, 'file'),
      alias($._data_keyword, 'data'),
      alias($._catalog_keyword, 'catalog'),
      alias($._memtype_keyword, 'memtype'),
      alias($._index_keyword, 'index'),
      alias($._constraint_keyword, 'constraint'),
      alias($._after_keyword, 'after'),
      alias($._eet_keyword, 'eet'),
      alias($._et_keyword, 'et'),
      alias($._generation_keyword, 'generation'),
      alias($._intype_keyword, 'intype'),
      alias($._outlib_keyword, 'outlib'),
      alias($._outtype_keyword, 'outtype'),
      $.identifier,
    ),

    // PROC CIMPORT: library=/file=/data=/catalog=/memtype=/eet=/et=/lib=/
    // libref=/cat=/ds=/mt=/compress=/encodinginfo=/extendformat=/extendsn=/
    // extendvar=/infile=/isfileutf8=/new=/sort=/ upcase= value options plus
    // boolean flags (force, noedit, nosrc, tape, upcase, new, sort, compress).
    // Same shape as proc_copy/cport_step; the proc name is emitted as the
    // alias($._proc_cimport_keyword,'cimport') token (no field('name')) and the
    // linter reads the name via inferProcNameFromStep (Phase 3 B3).
    //
    // NOTE on single-letter abbreviations (c/d/l/n/y): CIMPORT legitimately
    // accepts these one-char option aliases. A /[cC]/ regex would shadow the
    // first character of every identifier-led option and create unbounded lexical
    // conflict with $.identifier. They are therefore intentionally left out of
    // cimport_option_key's named-keyword arms: a bare 'c' / 'd' / 'l' / 'n' /
    // 'y' parses via the $.identifier fallback (still a cimport_option_key node,
    // still validated by the linter against the CIMPORT schema) — it just does
    // not receive an anonymous keyword token for highlighting. Pragmatic over
    // exhaustive (Phase 3 B3 brief guidance).
    proc_cimport_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_cimport_keyword, 'cimport'),
      optional(field('options', $.cimport_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    cimport_options: $ => repeat1(choice(
      $.cimport_option,
      $.cimport_option_flag,
      $.identifier,
    )),

    // key = value (e.g. library=work, file=x.ptx, memtype=data) OR key with a
    // parenthesized arg group. Mirrors proc_option/copy/cport_option's shape.
    cimport_option: $ => seq(
      $.cimport_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A CIMPORT option keyword with no value (boolean flag), e.g. force / tape /
    // noedit / nosrc / upcase / new / sort / compress. Aliased to a named node
    // for highlighting/linting.
    cimport_option_flag: $ => alias(choice(
      $._force_keyword, $._noedit_keyword, $._nosrc_keyword,
      $._tape_keyword, $._upcase_keyword, $._new_keyword,
      $._sort_keyword, $._compress_keyword,
    ), 'cimport_option_flag'),

    // Option key: known CIMPORT keywords (aliased so they appear as anonymous
    // keyword nodes for highlighting) OR a generic identifier (unknown key OR a
    // single-letter alias c/d/l/n/y, which the linter may flag as invalid for
    // CIMPORT).
    cimport_option_key: $ => choice(
      alias($._library_keyword, 'library'),
      alias($._file_keyword, 'file'),
      alias($._data_keyword, 'data'),
      alias($._catalog_keyword, 'catalog'),
      alias($._memtype_keyword, 'memtype'),
      alias($._eet_keyword, 'eet'),
      alias($._et_keyword, 'et'),
      alias($._lib_keyword, 'lib'),
      alias($._libref_keyword, 'libref'),
      alias($._cat_keyword, 'cat'),
      alias($._ds_keyword, 'ds'),
      alias($._mt_keyword, 'mt'),
      alias($._compress_keyword, 'compress'),
      alias($._encodinginfo_keyword, 'encodinginfo'),
      alias($._extendformat_keyword, 'extendformat'),
      alias($._extendsn_keyword, 'extendsn'),
      alias($._extendvar_keyword, 'extendvar'),
      alias($._infile_keyword, 'infile'),
      alias($._isfileutf8_keyword, 'isfileutf8'),
      alias($._new_keyword, 'new'),
      alias($._sort_keyword, 'sort'),
      alias($._upcase_keyword, 'upcase'),
      alias($._nsrc_keyword, 'nsrc'),
      $.identifier,
    ),

    // PROC SORT: data=/out=/dupout=/sortseq=/sortsize=/uniqueout= value options
    // plus boolean flags (ascii, danish, ebcdic, finnish, national, norwegian,
    // swedish, reverse, datecopy, force, equals, noequals, nodupkey,
    // nouniquekey, nothreads, threads, tagsort, presorted, overwrite).
    // Same shape as proc_copy/cport/cimport_step; the proc name is emitted as the
    // alias($._sort_keyword,'sort') token (no field('name')) and the
    // linter reads the name via inferProcNameFromStep (Phase 3 C1).
    //
    // NOTE on token reuse: SORT reuses the existing _sort_keyword token (defined
    // earlier for CIMPORT's sort= option key) rather than a distinct
    // _proc_sort_keyword. The two would have identical /[sS][oO][rR][tT]/
    // regexes; duplicate token regexes create an unstable lexer conflict (the
    // parser could match 'sort' as either token, and the generic-step identifier
    // path won the tie during testing). Reusing the single _sort_keyword token
    // and aliasing it to 'sort' here is the correct, stable choice — the alias
    // controls the emitted node text and the step routing is decided by the
    // prec(1) dispatcher arm, not by the token identity.
    proc_sort_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._sort_keyword, 'sort'),
      optional(field('options', $.sort_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    sort_options: $ => repeat1(choice(
      $.sort_option,
      $.sort_option_flag,
      $.identifier,
    )),

    // key = value (e.g. data=work.a, out=sorted, dupout=dups, sortsize=100M) OR
    // key with a parenthesized arg group. Mirrors proc_option/copy/cport/
    // cimport_option's shape.
    sort_option: $ => seq(
      $.sort_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A SORT option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the 19 SORT flags: locale collation
    // order keywords (ascii/danish/ebcdic/finnish/national/norwegian/swedish),
    // reverse, datecopy, force, equals/noequals, nodupkey/nouniquekey,
    // nothreads/threads, tagsort, presorted, overwrite.
    sort_option_flag: $ => alias(choice(
      $._ascii_keyword, $._danish_keyword, $._ebcdic_keyword,
      $._finnish_keyword, $._national_keyword, $._norwegian_keyword,
      $._swedish_keyword, $._reverse_keyword,
      $._datecopy_keyword, $._force_keyword,
      $._equals_keyword, $._noequals_keyword,
      $._nodupkey_keyword, $._nouniquekey_keyword,
      $._nothreads_keyword, $._threads_keyword,
      $._tagsort_keyword, $._presorted_keyword, $._overwrite_keyword,
    ), 'sort_option_flag'),

    // Option key: known SORT value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for SORT).
    sort_option_key: $ => choice(
      alias($._data_keyword, 'data'),
      alias($._out_keyword, 'out'),
      alias($._dupout_keyword, 'dupout'),
      alias($._sortseq_keyword, 'sortseq'),
      alias($._sortsize_keyword, 'sortsize'),
      alias($._uniqueout_keyword, 'uniqueout'),
      $.identifier,
    ),

    // PROC DATASETS: lib=/library=/dd=/ddname=/memtype=/mt=/mtype=/gennum=/
    // alter=/pw=/read=/encryptkey= value options plus boolean flags (kill, force,
    // nolist, noprint, nowarn, details, nodetails). Same shape as proc_copy/cport/
    // cimport/sort_step; the proc name is emitted as the
    // alias($._proc_datasets_keyword,'datasets') token (no field('name')) and the
    // linter reads the name via inferProcNameFromStep (Phase 3 C2 / Task 12).
    //
    // HEADER-only struct: this wraps the options on the 'proc datasets ...;' header
    // line ONLY. The DATASETS body statements (datasets_lib_statement,
    // datasets_kill_statement, datasets_copy_statement, datasets_delete_statement,
    // datasets_change_statement, datasets_modify_statement, etc.) are pre-existing
    // rules in proc_body's choice() and remain UNCHANGED — proc_datasets_step
    // references $.proc_body for the body, exactly like proc_copy/cport/cimport/
    // sort_step. The linter validates header options against the DATASETS schema;
    // body statements are parsed/validated separately.
    //
    // NOTE on 'kill' and 'nolist': these keywords are ALSO legal DATASETS body
    // statements (datasets_kill_statement: 'kill ;', datasets_nolist_statement:
    // 'nolist ;'). On the HEADER line they are bare option flags; in the BODY they
    // start their own statement. The two never collide because the header options
    // terminate at the first ';' and the body begins after it — exactly the same
    // boundary that already governs every per-proc step.
    proc_datasets_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_datasets_keyword, 'datasets'),
      optional(field('options', $.datasets_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    datasets_options: $ => repeat1(choice(
      $.datasets_option,
      $.datasets_option_flag,
      $.identifier,
    )),

    // key = value (e.g. lib=work, library=work, memtype=data, gennum=2, dd=foo,
    // alter=secret, pw=secret, read=secret, encryptkey=key) OR key with a
    // parenthesized arg group. Mirrors proc_option/copy/cport/cimport/sort_option's
    // shape.
    datasets_option: $ => seq(
      $.datasets_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A DATASETS option keyword with no value (boolean flag), e.g. kill / force /
    // nolist / noprint / nowarn / details / nodetails. Aliased to a named node for
    // highlighting/linting.
    datasets_option_flag: $ => alias(choice(
      $._kill_keyword, $._force_keyword, $._nolist_keyword,
      $._noprint_keyword, $._nowarn_keyword,
      $._details_keyword, $._nodetails_keyword,
    ), 'datasets_option_flag'),

    // Option key: known DATASETS value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for DATASETS).
    datasets_option_key: $ => choice(
      alias($._lib_keyword, 'lib'),
      alias($._library_keyword, 'library'),
      alias($._dd_keyword, 'dd'),
      alias($._ddname_keyword, 'ddname'),
      alias($._memtype_keyword, 'memtype'),
      alias($._mt_keyword, 'mt'),
      alias($._mtype_keyword, 'mtype'),
      alias($._gennum_keyword, 'gennum'),
      alias($._alter_keyword, 'alter'),
      alias($._pw_keyword, 'pw'),
      alias($._read_keyword, 'read'),
      alias($._encryptkey_keyword, 'encryptkey'),
      $.identifier,
    ),

    // PROC APPEND: base=/data=/out=/appendver=/encryptkey= value options plus
    // boolean flags (force, getsort, new, nowarn). Same shape as proc_copy/cport/
    // cimport/sort/datasets_step; the proc name is emitted as the
    // alias($._proc_append_keyword,'append') token (no field('name')) and the
    // linter reads the name via inferProcNameFromStep (Phase 3 C3 / Task 13).
    proc_append_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_append_keyword, 'append'),
      optional(field('options', $.append_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    append_options: $ => repeat1(choice(
      $.append_option,
      $.append_option_flag,
      $.identifier,
    )),

    // key = value (e.g. base=work.master, data=work.adds, out=merged,
    // appendver=V9, encryptkey=key) OR key with a parenthesized arg group.
    // Mirrors proc_option/copy/cport/cimport/sort/datasets_option's shape.
    append_option: $ => seq(
      $.append_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // An APPEND option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the 4 APPEND flags: force, getsort,
    // new, nowarn.
    append_option_flag: $ => alias(choice(
      $._force_keyword, $._getsort_keyword,
      $._new_keyword, $._nowarn_keyword,
    ), 'append_option_flag'),

    // Option key: known APPEND value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for APPEND).
    append_option_key: $ => choice(
      alias($._base_keyword, 'base'),
      alias($._data_keyword, 'data'),
      alias($._out_keyword, 'out'),
      alias($._appendver_keyword, 'appendver'),
      alias($._encryptkey_keyword, 'encryptkey'),
      $.identifier,
    ),

    // PROC STANDARD: data=/mean=/out=/s=/std=/vardef=/m=/preserverawbyvalues=
    // value options plus boolean flags (exclnpwgt, exclnpwgts, noprint, print,
    // replace). Same shape as proc_copy/cport/cimport/sort/datasets/append_step;
    // the proc name is emitted as the alias($._proc_standard_keyword,'standard')
    // token (no field('name')) and the linter reads the name via
    // inferProcNameFromStep (Phase 3 C3 / Task 14).
    //
    // Single-letter value-option keys 'm' and 's' (mean/std shorthand) use
    // dedicated _m_keyword/_s_keyword char-class tokens. tree-sitter's longest-
    // match rule makes them win over the generic identifier (length 1 vs N) at
    // the exact token boundary, and the $.identifier fallback in
    // standard_option_key still catches unknown single-letter keys.
    proc_standard_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_standard_keyword, 'standard'),
      optional(field('options', $.standard_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    standard_options: $ => repeat1(choice(
      $.standard_option,
      $.standard_option_flag,
      $.identifier,
    )),

    // key = value (e.g. data=sashelp.class, mean=100, out=standardized,
    // s=15, std=1, vardef=DF, m=50, preserverawbyvalues=YES) OR key with a
    // parenthesized arg group. Mirrors proc_option/copy/.../append_option's shape.
    standard_option: $ => seq(
      $.standard_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A STANDARD option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the 5 STANDARD flags: exclnpwgt,
    // exclnpwgts, noprint, print, replace.
    standard_option_flag: $ => alias(choice(
      $._exclnpwgt_keyword, $._exclnpwgts_keyword,
      $._noprint_keyword, $._print_keyword,
      $._replace_keyword,
    ), 'standard_option_flag'),

    // Option key: known STANDARD value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for STANDARD).
    standard_option_key: $ => choice(
      alias($._data_keyword, 'data'),
      alias($._mean_keyword, 'mean'),
      alias($._out_keyword, 'out'),
      alias($._s_keyword, 's'),
      alias($._std_keyword, 'std'),
      alias($._vardef_keyword, 'vardef'),
      alias($._m_keyword, 'm'),
      alias($._preserverawbyvalues_keyword, 'preserverawbyvalues'),
      $.identifier,
    ),

    // PROC PRINTTO: file=/label=/log=/name=/print=/unit= value options plus a
    // single boolean flag (new). Same shape as proc_copy/cport/cimport/sort/
    // datasets/append/standard_step; the proc name is emitted as the
    // alias($._proc_printto_keyword,'printto') token (no field('name')) and the
    // linter reads the name via inferProcNameFromStep (Phase 3 C3 / Task 15).
    //
    // PRINTTO's value-option keys are all multi-letter (file, label, log, name,
    // print, unit), so tree-sitter's longest-match resolves each ahead of the
    // generic identifier token at the option-key boundary; the $.identifier
    // fallback in printto_option_key still catches unknown keys.
    proc_printto_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_printto_keyword, 'printto'),
      optional(field('options', $.printto_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    printto_options: $ => repeat1(choice(
      $.printto_option,
      $.printto_option_flag,
      $.identifier,
    )),

    // key = value (e.g. file='out.lst', label='run1', log='out.log',
    // name=foo, print='out.prn', unit=2) OR key with a parenthesized arg group.
    // Mirrors proc_option/copy/.../standard_option's shape.
    printto_option: $ => seq(
      $.printto_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A PRINTTO option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the single PRINTTO flag: new.
    printto_option_flag: $ => alias(choice(
      $._new_keyword,
    ), 'printto_option_flag'),

    // Option key: known PRINTTO value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for PRINTTO).
    printto_option_key: $ => choice(
      alias($._file_keyword, 'file'),
      alias($._label_keyword, 'label'),
      alias($._log_keyword, 'log'),
      alias($._name_keyword, 'name'),
      alias($._print_keyword, 'print'),
      alias($._unit_keyword, 'unit'),
      $.identifier,
    ),

    // PROC TRANSPOSE: data=/delim=/delimiter=/label=/name=/out=/prefix=/suffix=
    // value options plus a single boolean flag (let). Same shape as proc_copy/
    // cport/cimport/sort/datasets/append/standard/printto_step; the proc name is
    // emitted as the alias($._proc_transpose_keyword,'transpose') token (no
    // field('name')) and the linter reads the name via inferProcNameFromStep
    // (Phase 3 C3 / Task 16).
    //
    // HEADER-only struct (like DATASETS): this wraps the options on the
    // 'proc transpose ...;' header line ONLY. TRANSPOSE's pre-existing BODY
    // statement rules (transpose_var_statement, transpose_id_statement,
    // transpose_idlabel_statement, transpose_copy_statement) live in proc_body's
    // choice() and are UNCHANGED — proc_transpose_step references $.proc_body for
    // the body, exactly like proc_datasets_step. The header options terminate at
    // the first ';' and the body begins after it (same boundary as every per-proc
    // step), so 'let' as a header flag never collides with body statements.
    //
    // TRANSPOSE's value-option keys are all multi-letter (data, delim, delimiter,
    // label, name, out, prefix, suffix), so tree-sitter's longest-match resolves
    // each ahead of the generic identifier token at the option-key boundary; the
    // $.identifier fallback in transpose_option_key still catches unknown keys.
    proc_transpose_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_transpose_keyword, 'transpose'),
      optional(field('options', $.transpose_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    transpose_options: $ => repeat1(choice(
      $.transpose_option,
      $.transpose_option_flag,
      $.identifier,
    )),

    // key = value (e.g. data=work.in, out=work.out, prefix=col, suffix=_val,
    // name=varname, label='row label', delim=',', delimiter='|') OR key with a
    // parenthesized arg group. Mirrors proc_option/copy/.../printto_option's shape.
    transpose_option: $ => seq(
      $.transpose_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A TRANSPOSE option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the single TRANSPOSE flag: let.
    transpose_option_flag: $ => alias(choice(
      $._let_keyword,
    ), 'transpose_option_flag'),

    // Option key: known TRANSPOSE value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for TRANSPOSE).
    transpose_option_key: $ => choice(
      alias($._data_keyword, 'data'),
      alias($._delim_keyword, 'delim'),
      alias($._delimiter_keyword, 'delimiter'),
      alias($._label_keyword, 'label'),
      alias($._name_keyword, 'name'),
      alias($._out_keyword, 'out'),
      alias($._prefix_keyword, 'prefix'),
      alias($._suffix_keyword, 'suffix'),
      $.identifier,
    ),

    // PROC CONTENTS: centiles=/data=/encryptkey=/memtype=/mt=/mtype=/order=/out=/
    // out2=/varnum= value options plus boolean flags (details, directory,
    // nodetails, nods, noprint, short, fmtlen). Same shape as proc_copy/cport/
    // cimport/sort/datasets/append/standard/printto/transpose_step; the proc name
    // is emitted as the alias($._proc_contents_keyword,'contents') token (no
    // field('name')) and the linter reads the name via inferProcNameFromStep
    // (Phase 3 C3 / Task 17).
    //
    // HEADER-only struct (like DATASETS/TRANSPOSE): this wraps the options on the
    // 'proc contents ...;' header line ONLY. CONTENTS's pre-existing BODY
    // statement rules (contents_data_statement, contents_out_statement,
    // contents_flag_statement) live in proc_body's choice() and are UNCHANGED —
    // proc_contents_step references $.proc_body for the body, exactly like
    // proc_datasets_step. The header options terminate at the first ';' and the
    // body begins after it (same boundary as every per-proc step), so a header
    // flag like 'noprint'/'details' never collides with contents_flag_statement
    // (which itself only matches inside the body, terminated by its own ';').
    //
    // CONTENTS's value-option keys are all multi-letter (centiles, data,
    // encryptkey, memtype, mt, mtype, order, out, out2, varnum), so tree-sitter's
    // longest-match resolves each ahead of the generic identifier token at the
    // option-key boundary; the $.identifier fallback in contents_option_key still
    // catches unknown keys. 'mt' (2 letters) is below the single-letter threshold
    // and is already a shared keyword token (_mt_keyword, CIMPORT), so it routes
    // cleanly here too.
    proc_contents_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_contents_keyword, 'contents'),
      optional(field('options', $.contents_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    contents_options: $ => repeat1(choice(
      $.contents_option,
      $.contents_option_flag,
      $.identifier,
    )),

    // key = value (e.g. data=work.in, out=work.out, out2=work.out2,
    // memtype=data, mt=view, order=varnum, centiles=4, encryptkey='key',
    // varnum, mtype=catalog) OR key with a parenthesized arg group. Mirrors
    // proc_option/copy/.../transpose_option's shape.
    contents_option: $ => seq(
      $.contents_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A CONTENTS option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the CONTENTS flags: details,
    // directory, nodetails, nods, noprint, short, fmtlen.
    contents_option_flag: $ => alias(choice(
      $._details_keyword,
      $._directory_keyword,
      $._nodetails_keyword,
      $._nods_keyword,
      $._noprint_keyword,
      $._short_keyword,
      $._fmtlen_keyword,
    ), 'contents_option_flag'),

    // Option key: known CONTENTS value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for CONTENTS).
    contents_option_key: $ => choice(
      alias($._centiles_keyword, 'centiles'),
      alias($._data_keyword, 'data'),
      alias($._encryptkey_keyword, 'encryptkey'),
      alias($._memtype_keyword, 'memtype'),
      alias($._mt_keyword, 'mt'),
      alias($._mtype_keyword, 'mtype'),
      alias($._order_keyword, 'order'),
      alias($._out_keyword, 'out'),
      alias($._out2_keyword, 'out2'),
      alias($._varnum_keyword, 'varnum'),
      $.identifier,
    ),

    // PROC COMPARE: 75 keywords, the largest per-proc struct so far. base=/compare=/
    // data=/out=/criterion=/fuzz=/maxprint=/method=/m= value-options plus a large
    // boolean-flag family (all, list*, no*, stats, transpose, warn, ...). Same
    // shape as proc_copy/cport/cimport/sort/datasets/append/standard/printto/
    // transpose/contents; proc name is emitted as the alias($._proc_compare_keyword,
    // 'compare') token (no field('name')) and the linter reads the name via
    // inferProcNameFromStep (Phase 3 C3 / Task 18).
    //
    // Single-letter value-option keys: m (method) reuses _m_keyword (STANDARD/
    // global). b (base) and c (compare) are NOT given dedicated keyword tokens —
    // see the _comp_keyword comment above for why (error-recovery regression on
    // 'data a set b;'). They still route via the $.identifier fallback in
    // compare_option_key, so 'proc compare b=x c=y;' produces compare_option_key
    // nodes. 'base=x'/'compare=x' always parse as the 4/7-char keyword tokens via
    // longest-match, never as 'b'+'ase' or 'c'+'ompare'.
    proc_compare_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_compare_keyword, 'compare'),
      optional(field('options', $.compare_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    compare_options: $ => repeat1(choice(
      $.compare_option,
      $.compare_option_flag,
      $.identifier,
    )),

    // key = value (e.g. base=work.in, compare=work.new, data=work.in,
    // out=work.out, criterion=0.001, crit=1E-6, fuzz=1E-12, maxprint=50,
    // method=EXACT, meth=ABSOLUTE, b=work.in, c=work.new, m=EXACT,
    // outall=work.out) OR key with a parenthesized arg group. Mirrors
    // proc_option/copy/.../contents_option's shape.
    compare_option: $ => seq(
      $.compare_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A COMPARE option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the COMPARE flags (43 of them).
    compare_option_flag: $ => alias(choice(
      $._all_keyword, $._allobs_keyword, $._allstats_keyword, $._allvars_keyword,
      $._brief_keyword, $._briefsummary_keyword,
      $._error_keyword,
      $._list_keyword, $._listall_keyword,
      $._listbase_keyword, $._listbaseobs_keyword, $._listbasevar_keyword,
      $._listcomp_keyword, $._listcompare_keyword,
      $._listcompareobs_keyword, $._listcomparevar_keyword, $._listcomparevars_keyword,
      $._listcompobs_keyword, $._listcompvar_keyword,
      $._listeq_keyword, $._listequal_keyword, $._listequalvar_keyword, $._listeqvar_keyword,
      $._listobs_keyword, $._listvar_keyword,
      $._nodate_keyword, $._nomiss_keyword, $._nomiss1_keyword, $._nomiss2_keyword,
      $._nomissbase_keyword, $._nomisscomp_keyword, $._nomisscompare_keyword, $._nomissing_keyword,
      $._noobs_keyword,
      $._noprint_keyword,
      $._nosum_keyword, $._nosummary_keyword, $._note_keyword, $._novalues_keyword,
      $._printall_keyword, $._statistics_keyword, $._stats_keyword,
      $._trans_keyword, alias($._proc_transpose_keyword, 'transpose'),
      $._warn_keyword, $._warning_keyword,
    ), 'compare_option_flag'),

    // Option key: known COMPARE value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for COMPARE). Includes
    // single-letter 'b'/'c'/'m' value-option shorthand keys (base/compare/method).
    compare_option_key: $ => choice(
      alias($._base_keyword, 'base'),
      alias($._compare_keyword, 'compare'),
      alias($._comp_keyword, 'comp'),
      alias($._data_keyword, 'data'),
      alias($._out_keyword, 'out'),
      alias($._outall_keyword, 'outall'),
      alias($._outbase_keyword, 'outbase'),
      alias($._outcomp_keyword, 'outcomp'),
      alias($._outcompare_keyword, 'outcompare'),
      alias($._outdif_keyword, 'outdif'),
      alias($._outdiff_keyword, 'outdiff'),
      alias($._outnoeq_keyword, 'outnoeq'),
      alias($._outnoequal_keyword, 'outnoequal'),
      alias($._outpercent_keyword, 'outpercent'),
      alias($._outstats_keyword, 'outstats'),
      alias($._crit_keyword, 'crit'),
      alias($._criteria_keyword, 'criteria'),
      alias($._criterion_keyword, 'criterion'),
      alias($._fuzz_keyword, 'fuzz'),
      alias($._maxprint_keyword, 'maxprint'),
      alias($._meth_keyword, 'meth'),
      alias($._method_keyword, 'method'),
      alias($._m_keyword, 'm'),
      $.identifier,
    ),

    // PROC FREQ: compress=/data=/formchar=/nlevels=/order= value-options plus
    // boolean flags (noprint, page). Same shape as proc_copy/cport/cimport/
    // sort/datasets/append/standard/printto/transpose/contents/compare; proc name
    // is emitted as the alias($._proc_freq_keyword, 'freq') token (no
    // field('name')) and the linter reads the name via inferProcNameFromStep
    // (Phase 3 C3 / Task 22).
    //
    // HEADER-only struct (like DATASETS/TRANSPOSE/CONTENTS): this wraps the
    // options on the 'proc freq ...;' header line ONLY. FREQ's pre-existing BODY
    // statement rules (freq_tables_statement, freq_exact_statement,
    // freq_weight_statement, freq_test_statement, freq_output_statement) live in
    // proc_body's choice() and are UNCHANGED — proc_freq_step references
    // $.proc_body for the body, exactly like proc_contents_step. The header
    // options terminate at the first ';' and the body begins after it (same
    // boundary as every per-proc step), so a header flag like 'noprint'/'page'
    // never collides with any body statement (which only matches inside the body,
    // terminated by its own ';').
    //
    // FREQ's value-option keys are all multi-letter (compress, data, formchar,
    // nlevels, order), so tree-sitter's longest-match resolves each ahead of the
    // generic identifier token at the option-key boundary; the $.identifier
    // fallback in freq_option_key still catches unknown keys. The 7-letter
    // 'formchar' value-option is a long char string (e.g. formchar=|----|), but
    // the value routes through $.expression / $.quoted_string so it parses
    // cleanly without a dedicated value node.
    proc_freq_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_freq_keyword, 'freq'),
      optional(field('options', $.freq_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    freq_options: $ => repeat1(choice(
      $.freq_option,
      $.freq_option_flag,
      $.identifier,
    )),

    // key = value (e.g. data=work.in, order=freq, compress=yes, nlevels=10,
    // formchar='|----|') OR key with a parenthesized arg group. Mirrors
    // proc_option/copy/.../compare_option's shape.
    freq_option: $ => seq(
      $.freq_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A FREQ option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the FREQ flags: noprint, page.
    freq_option_flag: $ => alias(choice(
      $._noprint_keyword,
      $._page_keyword,
    ), 'freq_option_flag'),

    // Option key: known FREQ value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for FREQ).
    freq_option_key: $ => choice(
      alias($._compress_keyword, 'compress'),
      alias($._data_keyword, 'data'),
      alias($._formchar_keyword, 'formchar'),
      alias($._nlevels_keyword, 'nlevels'),
      alias($._order_keyword, 'order'),
      $.identifier,
    ),

    // PROC OPTIONS: define=/group=/hexvalue=/option=/port=/value= value-options
    // plus boolean flags (expand/noexpand, host/nohost,
    // lognumberformat/nolognumberformat, long, listgroups, listinsertappend,
    // listoptsave, listrestrict, portable, restrict, short). Same shape as
    // proc_copy/cport/cimport/sort/datasets/append/standard/printto/transpose/
    // contents/compare/freq; proc name is emitted as the
    // alias($._proc_options_keyword, 'options') token (no field('name')) and the
    // linter reads the name via inferProcNameFromStep (Phase 3 C3 / Task 19).
    //
    // HEADER-only struct (like DATASETS/TRANSPOSE/CONTENTS/FREQ): this wraps the
    // options on the 'proc options ...;' header line ONLY. OPTIONS's pre-existing
    // BODY statement rules (options_option_statement starting with 'option',
    // options_group_statement starting with 'group =') live in proc_body's
    // choice() and are UNCHANGED — proc_options_step references $.proc_body for
    // the body, exactly like proc_freq_step. The header options terminate at the
    // first ';' and the body begins after it (same boundary as every per-proc
    // step), so a header key like 'option'/'group' never collides with any body
    // statement (which only matches inside the body, terminated by its own ';').
    //
    // OPTIONS's value-option keys are all multi-letter (define/group/hexvalue/
    // option/port/value), so tree-sitter's longest-match resolves each ahead of
    // the generic identifier token at the option-key boundary; the $.identifier
    // fallback in options_option_key still catches unknown keys.
    proc_options_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_options_keyword, 'options'),
      optional(field('options', $.options_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    options_options: $ => repeat1(choice(
      $.options_option,
      $.options_option_flag,
      $.identifier,
    )),

    // key = value (e.g. option=linesize, group=MEMORY, define=value, port=XXXX,
    // hexvalue=yes) OR key with a parenthesized arg group OR a bare key.
    // Mirrors proc_option/copy/.../freq_option's shape.
    options_option: $ => seq(
      $.options_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // An OPTIONS option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the OPTIONS flags.
    options_option_flag: $ => alias(choice(
      $._expand_keyword,
      $._noexpand_keyword,
      $._host_keyword,
      $._nohost_keyword,
      $._lognumberformat_keyword,
      $._nolognumberformat_keyword,
      $._long_keyword,
      $._short_keyword,
      $._listgroups_keyword,
      $._listinsertappend_keyword,
      $._listoptsave_keyword,
      $._listrestrict_keyword,
      $._portable_keyword,
      $._restrict_keyword,
    ), 'options_option_flag'),

    // Option key: known OPTIONS value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for OPTIONS).
    options_option_key: $ => choice(
      alias($._define_keyword, 'define'),
      alias($._group_keyword, 'group'),
      alias($._hexvalue_keyword, 'hexvalue'),
      alias($._option_keyword, 'option'),
      alias($._port_keyword, 'port'),
      alias($._value_keyword, 'value'),
      $.identifier,
    ),

    // PROC PRINT: data=/double=/heading=/label=/n=/obs=/round=/rows=/split=/style=/
    // uniform=/width=/blank=/blankline=/contents=/grand_label=/grandtot_label=/
    // grandtotal_label=/gtot_label=/gtotal_label=/sumlabel=/nosumlabel= value-options
    // plus boolean flags (noobs, plus the single-letter d/l/n/r/s shorthand).
    // Same shape as proc_copy/cport/cimport/sort/datasets/append/standard/printto/
    // transpose/contents/compare/freq/options; proc name is emitted as the
    // alias($._proc_print_keyword, 'print') token (no field('name')) and the
    // linter reads the name via inferProcNameFromStep (Phase 3 C3 / Task 20).
    //
    // HEADER-only struct (like DATASETS/TRANSPOSE/CONTENTS/FREQ/OPTIONS): this
    // wraps the options on the 'proc print ...;' header line ONLY. PRINT's
    // pre-existing BODY statement rules (print_var_statement starting with 'var',
    // print_id_statement starting with 'id', print_sum_statement starting with
    // 'sum', print_pageby_statement starting with 'pageby') live in proc_body's
    // choice() and are UNCHANGED — proc_print_step references $.proc_body for the
    // body, exactly like proc_freq_step/proc_options_step. The header options
    // terminate at the first ';' and the body begins after it (same boundary as
    // every per-proc step), so a header key never collides with any body
    // statement (which only matches inside the body, terminated by its own ';').
    //
    // SINGLE-LETTER KEYS d/l/n/r/s: PRINT accepts single-letter option shorthand
    // (d=double, l=label, n=number-of-obs, r=round, s=sum). s reuses _s_keyword
    // (STANDARD/global). d/l/n/r get dedicated _d_keyword/_l_keyword/_n_keyword/
    // _r_keyword char-class tokens (see their block comment above). Empirically
    // (Task 20) all four route cleanly with no corpus regression — unlike
    // COMPARE's b/c (Task 18), no fallback-to-identifier is needed. tree-sitter's
    // longest-match still resolves e.g. 'data=' as the 4-char _data_keyword
    // (never as 'd'+'ata'), 'label=' as the 5-char _label_keyword (never as
    // 'l'+'abel'), 'round=' as 5-char _round_keyword (never 'r'+'ound'), and
    // 'noobs' as the 5-char _noobs_keyword (never 'n'+'oops'); the $.identifier
    // fallback in print_option_key catches any unknown single-letter key.
    proc_print_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_print_keyword, 'print'),
      optional(field('options', $.print_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    print_options: $ => repeat1(choice(
      $.print_option,
      $.print_option_flag,
      $.identifier,
    )),

    // key = value (e.g. data=sashelp.class, double=no, heading=both, label,
    // n=5, obs=10, round=0.01, rows=page, split='*', style=[style...],
    // uniform, width=full, blank, blankline, contents=yes,
    // grand_label='Total', grandtot_label='Grand', grandtotal_label='All',
    // gtot_label='GT', gtotal_label='GTotal', sumlabel='Sum', nosumlabel,
    // d=foo, l, n=20, r, s) OR key with a parenthesized arg group. Mirrors
    // proc_option/copy/.../options_option's shape.
    print_option: $ => seq(
      $.print_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A PRINT option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the PRINT flags: noobs (reuses the
    // COMPARE/global _noobs_keyword). The single-letter shorthand d/l/n/r/s are
    // value-option keys (see print_option_key) NOT flags — matching the
    // COMPARE/STANDARD precedent where _m_keyword lives only in *_option_key, so
    // a bare 's' still parses via print_option (key with no '= value') and the
    // option_flag list stays conflict-free.
    print_option_flag: $ => alias(choice(
      $._noobs_keyword,
    ), 'print_option_flag'),

    // Option key: known PRINT value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for PRINT). Includes the
    // multi-letter keys (blank/blankline/contents/data/double/grand_label/
    // grandtot_label/grandtotal_label/gtot_label/gtotal_label/heading/label/obs/
    // round/rows/split/style/sumlabel/nosumlabel/uniform/width) and the
    // single-letter d/l/n/r/s shorthand keys.
    print_option_key: $ => choice(
      alias($._blank_keyword, 'blank'),
      alias($._blankline_keyword, 'blankline'),
      alias($._contents_keyword, 'contents'),
      alias($._data_keyword, 'data'),
      alias($._double_keyword, 'double'),
      alias($._grand_label_keyword, 'grand_label'),
      alias($._grandtot_label_keyword, 'grandtot_label'),
      alias($._grandtotal_label_keyword, 'grandtotal_label'),
      alias($._gtot_label_keyword, 'gtot_label'),
      alias($._gtotal_label_keyword, 'gtotal_label'),
      alias($._heading_keyword, 'heading'),
      alias($._label_keyword, 'label'),
      alias($._obs_keyword, 'obs'),
      alias($._round_keyword, 'round'),
      alias($._rows_keyword, 'rows'),
      alias($._split_keyword, 'split'),
      alias($._style_keyword, 'style'),
      alias($._sumlabel_keyword, 'sumlabel'),
      alias($._nosumlabel_keyword, 'nosumlabel'),
      alias($._uniform_keyword, 'uniform'),
      alias($._width_keyword, 'width'),
      alias($._d_keyword, 'd'),
      alias($._l_keyword, 'l'),
      alias($._n_keyword, 'n'),
      alias($._r_keyword, 'r'),
      alias($._s_keyword, 's'),
      $.identifier,
    ),

    // PROC MEANS: data=/alpha=/fw=/maxdec=/order=/vardef=/qmarkers=/qmethod=/
    // qntldef=/pctldef=/sumsize=/incas=/classdata= value-options plus the
    // statistic keywords (n/mean/std/min/max/sum/range/var/skew/kurt/css/clm/
    // lclm/uclm/probt/t/uss/stderr/sumwgt/nmiss/median/mode/q1/q3/qrange/p1..p99)
    // and the descend=/descending= direction options. Same shape as proc_copy/
    // cport/cimport/sort/datasets/append/standard/printto/transpose/contents/
    // compare/freq/options/print; proc name is emitted as the
    // alias($._proc_means_keyword, 'means') token (no field('name')) and the
    // linter reads the name via inferProcNameFromStep (Phase 3 C3 / Task 21).
    //
    // HEADER-only struct (like DATASETS/TRANSPOSE/CONTENTS/FREQ/OPTIONS/PRINT):
    // this wraps the options on the 'proc means ...;' header line ONLY. MEANS's
    // pre-existing BODY statement rules (means_var_statement starting with 'var',
    // means_class_statement starting with 'class', means_freq_statement starting
    // with 'freq', means_weight_statement starting with 'weight',
    // means_id_statement starting with 'id', means_output_statement starting
    // with 'output', means_types_statement starting with 'types',
    // means_ways_statement starting with 'ways') live in proc_body's choice()
    // and are UNCHANGED — proc_means_step references $.proc_body for the body,
    // exactly like proc_freq_step/proc_options_step/proc_print_step. The header
    // options terminate at the first ';' and the body begins after it (same
    // boundary as every per-proc step), so a header key never collides with any
    // body statement (which only matches inside the body, terminated by its own
    // ';'). Note: 'var' is both a MEANS header option (vardef) and a body
    // statement keyword (means_var_statement) — but the header 'var' only ever
    // appears as a bare option-key or as 'var=...' BEFORE the first ';', while
    // the body 'var' appears AFTER the first ';' starting means_var_statement,
    // so there is no real ambiguity.
    //
    // SINGLE-LETTER KEYS n/t: MEANS accepts single-letter statistic shorthand
    // (n = count of nonmissing values, t = t-statistic). n reuses _n_keyword
    // (PRINT/global). t gets a dedicated _t_keyword char-class token (see its
    // block comment below). Empirically (Task 21) both route cleanly with no
    // corpus regression — tree-sitter's longest-match still resolves e.g.
    // 'nway' as the 4-char _nway_keyword (never 'n'+'way'), 'nmiss' as the
    // 5-char _nmiss_keyword (never 'n'+'miss'), 'noprint' as 7-char
    // _noprint_keyword (never 'n'+'oprint'), 'threads' as 7-char _threads_keyword
    // (never 't'+'hreads'); the $.identifier fallback in means_option_key
    // catches any unknown single-letter key.
    //
    // PERCENTILE KEYS p1/p5/.../p99: these have digits in them. The regex
    // char-class form works (e.g. _p1_keyword: /[pP]1/). tree-sitter's
    // longest-match resolves 'p10' as the 3-char _p10_keyword (never 'p1'+'0'),
    // 'p100' (not a real MEANS option but a defensive check) would NOT match any
    // _pN_keyword and falls to $.identifier; and 'p1' alone matches _p1_keyword.
    // The empirical check below verifies 'p10=x' parses as p10 (not p1+0).
    proc_means_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_means_keyword, 'means'),
      optional(field('options', $.means_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    means_options: $ => repeat1(choice(
      $.means_option,
      $.means_option_flag,
      $.identifier,
    )),

    // key = value (e.g. data=sashelp.class, alpha=0.05, fw=12, maxdec=2,
    // order=freq, vardef=df, qmarkers=2, qmethod=approx, qntldef=3,
    // pctldef=4, sumsize=full, incas=identical, classdata=x.types,
    // descend=age, descending=age) OR a bare statistic keyword (n, mean, std,
    // min, max, sum, range, var, skew, kurt, css, clm, lclm, uclm, probt, t,
    // uss, stderr, sumwgt, nmiss, median, mode, q1, q3, qrange, p1..p99) OR
    // key with a parenthesized arg group. Mirrors proc_option/copy/.../options
    // /print_option's shape.
    means_option: $ => seq(
      $.means_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    // A MEANS option keyword with no value (boolean flag). Aliased to a named
    // node for highlighting/linting. Covers the canonical MEANS boolean flags:
    // chartype, completetypes, descendtypes, exclusive, idmin, missing,
    // nolabel, nonobs, noprint (reuses DATASETS/global _noprint_keyword),
    // notrap, nway, printalltypes, printids, printidvars, stackods,
    // stackodsoutput, exclnpwgt/exclnpwgts (reuses STANDARD/global), nothreads
    // (reuses DATASETS/global _nothreads_keyword), threads (reuses
    // DATASETS/global _threads_keyword), print (reuses STANDARD/global
    // _print_keyword), printall (reuses FREQ/global _printall_keyword). The
    // statistic keywords (mean/std/n/...) are value-option keys (see
    // means_option_key) NOT flags — a bare 'mean' still parses via means_option
    // (key with no '= value') and the option_flag list stays conflict-free.
    means_option_flag: $ => alias(choice(
      $._chartype_keyword,
      $._completetypes_keyword,
      $._descendtypes_keyword,
      $._exclusive_keyword,
      $._idmin_keyword,
      $._missing_keyword,
      $._nolabel_keyword,
      $._nonobs_keyword,
      $._noprint_keyword,
      $._notrap_keyword,
      $._nway_keyword,
      $._printalltypes_keyword,
      $._printids_keyword,
      $._printidvars_keyword,
      $._stackods_keyword,
      $._stackodsoutput_keyword,
      $._exclnpwgt_keyword,
      $._exclnpwgts_keyword,
      $._nothreads_keyword,
      $._threads_keyword,
      $._print_keyword,
      $._printall_keyword,
    ), 'means_option_flag'),

    // Option key: known MEANS value-option keywords (aliased so they appear as
    // anonymous keyword nodes for highlighting) OR a generic identifier (unknown
    // key, which the linter may flag as invalid for MEANS). Includes the
    // value-options (alpha/chartype-less/data/descend/descending/fw/incas/
    // maxdec/order/pctldef/qmarkers/qmethod/qntldef/sumsize/vardef/classdata),
    // the statistic keywords (clm/css/kurt/kurtosis/lclm/max/mean/median/min/
    // mode/n/nmiss/p1..p99/pbt/probt/q1/q3/qrange/range/skew/skewness/std/
    // stddev/stderr/sum/sumwgt/t/uclm/uss/var), and the single-letter n/t
    // statistic shorthand keys.
    means_option_key: $ => choice(
      // Value-options (typically key=value):
      alias($._alpha_keyword, 'alpha'),
      alias($._classdata_keyword, 'classdata'),
      alias($._data_keyword, 'data'),
      alias($._descend_keyword, 'descend'),
      alias($._descending_keyword, 'descending'),
      alias($._fw_keyword, 'fw'),
      alias($._incas_keyword, 'incas'),
      alias($._maxdec_keyword, 'maxdec'),
      alias($._order_keyword, 'order'),
      alias($._pctldef_keyword, 'pctldef'),
      alias($._qmarkers_keyword, 'qmarkers'),
      alias($._qmethod_keyword, 'qmethod'),
      alias($._qntldef_keyword, 'qntldef'),
      alias($._sumsize_keyword, 'sumsize'),
      alias($._vardef_keyword, 'vardef'),
      // Statistic keywords (bare flags or take args in OUTPUT):
      alias($._clm_keyword, 'clm'),
      alias($._css_keyword, 'css'),
      alias($._kurt_keyword, 'kurt'),
      alias($._kurtosis_keyword, 'kurtosis'),
      alias($._lclm_keyword, 'lclm'),
      alias($._max_keyword, 'max'),
      alias($._mean_keyword, 'mean'),
      alias($._median_keyword, 'median'),
      alias($._min_keyword, 'min'),
      alias($._mode_keyword, 'mode'),
      alias($._nmiss_keyword, 'nmiss'),
      alias($._pbt_keyword, 'pbt'),
      alias($._probt_keyword, 'probt'),
      alias($._q1_keyword, 'q1'),
      alias($._q3_keyword, 'q3'),
      alias($._qrange_keyword, 'qrange'),
      alias($._range_keyword, 'range'),
      alias($._skew_keyword, 'skew'),
      alias($._skewness_keyword, 'skewness'),
      alias($._std_keyword, 'std'),
      alias($._stddev_keyword, 'stddev'),
      alias($._stderr_keyword, 'stderr'),
      alias($._sum_keyword, 'sum'),
      alias($._sumwgt_keyword, 'sumwgt'),
      alias($._uclm_keyword, 'uclm'),
      alias($._uss_keyword, 'uss'),
      alias($._var_keyword, 'var'),
      // Percentile statistic keywords (p1/p5/p10/.../p99):
      alias($._p1_keyword, 'p1'),
      alias($._p5_keyword, 'p5'),
      alias($._p10_keyword, 'p10'),
      alias($._p20_keyword, 'p20'),
      alias($._p25_keyword, 'p25'),
      alias($._p30_keyword, 'p30'),
      alias($._p40_keyword, 'p40'),
      alias($._p50_keyword, 'p50'),
      alias($._p60_keyword, 'p60'),
      alias($._p70_keyword, 'p70'),
      alias($._p75_keyword, 'p75'),
      alias($._p80_keyword, 'p80'),
      alias($._p90_keyword, 'p90'),
      alias($._p95_keyword, 'p95'),
      alias($._p99_keyword, 'p99'),
      // Single-letter statistic shorthand (n reuses PRINT/global; t is new):
      alias($._n_keyword, 'n'),
      alias($._t_keyword, 't'),
      $.identifier,
    ),

    // proc_body is optional (via optional()) so that PROCs with no body statements
    // (e.g., "proc contents data=x; run;") don't have run; consumed as a
    // bare_statement. When proc_body IS present, it uses repeat1() internally
    // to satisfy tree-sitter's prohibition on empty-string-matching rules.
    //
    // proc_generic_step is the verbatim original proc_step body. It is the
    // fallback for any PROC not yet converted to a per-proc *_step rule, so
    // non-COPY PROC behavior is unchanged.
    // --- PROC REG per-proc struct (Phase 3 D) ---
    proc_reg_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_reg_keyword, 'reg'),
      optional(field('options', $.reg_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    reg_options: $ => repeat1(choice(
      $.reg_option,
      $.identifier,
    )),

    reg_option: $ => seq(
      $.reg_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    reg_option_key: $ => choice(
      alias($._all_keyword, 'all'),
      alias($._alpha_keyword, 'alpha'),
      alias($._annotate_keyword, 'annotate'),
      alias($._corr_keyword, 'corr'),
      alias($._covout_keyword, 'covout'),
      alias($._data_keyword, 'data'),
      alias($._edf_keyword, 'edf'),
      alias($._gout_keyword, 'gout'),
      alias($._lineprinter_keyword, 'lineprinter'),
      alias($._noprint_keyword, 'noprint'),
      alias($._outest_keyword, 'outest'),
      alias($._outseb_keyword, 'outseb'),
      alias($._outsscp_keyword, 'outsscp'),
      alias($._outstb_keyword, 'outstb'),
      alias($._outvif_keyword, 'outvif'),
      alias($._pcomit_keyword, 'pcomit'),
      alias($._plots_keyword, 'plots'),
      alias($._press_keyword, 'press'),
      alias($._ridge_keyword, 'ridge'),
      alias($._rsquare_keyword, 'rsquare'),
      alias($._simple_keyword, 'simple'),
      alias($._singular_keyword, 'singular'),
      alias($._tableout_keyword, 'tableout'),
      alias($._usscp_keyword, 'usscp'),
      $.identifier,
    ),

    // --- PROC GLM per-proc struct (Phase 3 D) ---
    proc_glm_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_glm_keyword, 'glm'),
      optional(field('options', $.glm_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    glm_options: $ => repeat1(choice(
      $.glm_option,
      $.identifier,
    )),

    glm_option: $ => seq(
      $.glm_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    glm_option_key: $ => choice(
      alias($._alpha_keyword, 'alpha'),
      alias($._data_keyword, 'data'),
      alias($._manova_keyword, 'manova'),
      alias($._multipass_keyword, 'multipass'),
      alias($._namelen_keyword, 'namelen'),
      alias($._noprint_keyword, 'noprint'),
      alias($._order_keyword, 'order'),
      alias($._outstat_keyword, 'outstat'),
      alias($._plots_keyword, 'plots'),
      $.identifier,
    ),

    // --- PROC MIXED per-proc struct (Phase 3 D) ---
    proc_mixed_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_mixed_keyword, 'mixed'),
      optional(field('options', $.mixed_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    mixed_options: $ => repeat1(choice(
      $.mixed_option,
      $.identifier,
    )),

    mixed_option: $ => seq(
      $.mixed_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    mixed_option_key: $ => choice(
      alias($._absolute_keyword, 'absolute'),
      alias($._alpha_keyword, 'alpha'),
      alias($._anovaf_keyword, 'anovaf'),
      alias($._asycorr_keyword, 'asycorr'),
      alias($._asycov_keyword, 'asycov'),
      alias($._cl_keyword, 'cl'),
      alias($._convf_keyword, 'convf'),
      alias($._convg_keyword, 'convg'),
      alias($._convh_keyword, 'convh'),
      alias($._covtest_keyword, 'covtest'),
      alias($._data_keyword, 'data'),
      alias($._dfbw_keyword, 'dfbw'),
      alias($._empirical_keyword, 'empirical'),
      alias($._ic_keyword, 'ic'),
      alias($._info_keyword, 'info'),
      alias($._itdetails_keyword, 'itdetails'),
      alias($._lognote_keyword, 'lognote'),
      alias($._maxfunc_keyword, 'maxfunc'),
      alias($._maxiter_keyword, 'maxiter'),
      alias($._method_keyword, 'method'),
      alias($._mmeq_keyword, 'mmeq'),
      alias($._mmeqsol_keyword, 'mmeqsol'),
      alias($._namelen_keyword, 'namelen'),
      alias($._nobound_keyword, 'nobound'),
      alias($._noclprint_keyword, 'noclprint'),
      alias($._noinfo_keyword, 'noinfo'),
      alias($._noitprint_keyword, 'noitprint'),
      alias($._noprofile_keyword, 'noprofile'),
      alias($._ord_keyword, 'ord'),
      alias($._order_keyword, 'order'),
      alias($._plots_keyword, 'plots'),
      alias($._ranks_keyword, 'ranks'),
      alias($._ratio_keyword, 'ratio'),
      alias($._ridge_keyword, 'ridge'),
      alias($._scoring_keyword, 'scoring'),
      alias($._sigiter_keyword, 'sigiter'),
      alias($._update_keyword, 'update'),
      $.identifier,
    ),

    // --- PROC ANOVA per-proc struct (Phase 3 D) ---
    proc_anova_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_anova_keyword, 'anova'),
      optional(field('options', $.anova_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    anova_options: $ => repeat1(choice(
      $.anova_option,
      $.identifier,
    )),

    anova_option: $ => seq(
      $.anova_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    anova_option_key: $ => choice(
      alias($._data_keyword, 'data'),
      alias($._manova_keyword, 'manova'),
      alias($._multipass_keyword, 'multipass'),
      alias($._namelen_keyword, 'namelen'),
      alias($._order_keyword, 'order'),
      alias($._outstat_keyword, 'outstat'),
      alias($._plots_keyword, 'plots'),
      $.identifier,
    ),

    // --- PROC PHREG per-proc struct (Phase 3 D) ---
    proc_phreg_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_phreg_keyword, 'phreg'),
      optional(field('options', $.phreg_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    phreg_options: $ => repeat1(choice(
      $.phreg_option,
      $.identifier,
    )),

    phreg_option: $ => seq(
      $.phreg_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    phreg_option_key: $ => choice(
      alias($._alpha_keyword, 'alpha'),
      alias($._atrisk_keyword, 'atrisk'),
      alias($._covm_keyword, 'covm'),
      alias($._covout_keyword, 'covout'),
      alias($._covs_keyword, 'covs'),
      alias($._covsandwich_keyword, 'covsandwich'),
      alias($._data_keyword, 'data'),
      alias($._inest_keyword, 'inest'),
      alias($._multipass_keyword, 'multipass'),
      alias($._namelen_keyword, 'namelen'),
      alias($._noprint_keyword, 'noprint'),
      alias($._nosummary_keyword, 'nosummary'),
      alias($._outest_keyword, 'outest'),
      alias($._plots_keyword, 'plots'),
      alias($._simple_keyword, 'simple'),
      $.identifier,
    ),

    // --- PROC GENMOD per-proc struct (Phase 3 D) ---
    proc_genmod_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_genmod_keyword, 'genmod'),
      optional(field('options', $.genmod_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    genmod_options: $ => repeat1(choice(
      $.genmod_option,
      $.identifier,
    )),

    genmod_option: $ => seq(
      $.genmod_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    genmod_option_key: $ => choice(
      alias($._data_keyword, 'data'),
      alias($._desc_keyword, 'desc'),
      alias($._descend_keyword, 'descend'),
      alias($._descending_keyword, 'descending'),
      alias($._namelen_keyword, 'namelen'),
      alias($._order_keyword, 'order'),
      alias($._plots_keyword, 'plots'),
      alias($._rorder_keyword, 'rorder'),
      $.identifier,
    ),

    // --- PROC FACTOR per-proc struct (Phase 3 D) ---
    proc_factor_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_factor_keyword, 'factor'),
      optional(field('options', $.factor_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    factor_options: $ => repeat1(choice(
      $.factor_option,
      $.identifier,
    )),

    factor_option: $ => seq(
      $.factor_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    factor_option_key: $ => choice(
      alias($._all_keyword, 'all'),
      alias($._alpha_keyword, 'alpha'),
      alias($._ci_keyword, 'ci'),
      alias($._conv_keyword, 'conv'),
      alias($._converge_keyword, 'converge'),
      alias($._corr_keyword, 'corr'),
      alias($._cov_keyword, 'cov'),
      alias($._covariance_keyword, 'covariance'),
      alias($._cover_keyword, 'cover'),
      alias($._data_keyword, 'data'),
      alias($._eigenvectors_keyword, 'eigenvectors'),
      alias($._ev_keyword, 'ev'),
      alias($._flag_keyword, 'flag'),
      alias($._fuzz_keyword, 'fuzz'),
      alias($._gamma_keyword, 'gamma'),
      alias($._hey_keyword, 'hey'),
      alias($._heywood_keyword, 'heywood'),
      alias($._hkp_keyword, 'hkp'),
      alias($._hkpower_keyword, 'hkpower'),
      alias($._maxiter_keyword, 'maxiter'),
      alias($._method_keyword, 'method'),
      alias($._min_keyword, 'min'),
      alias($._mineigen_keyword, 'mineigen'),
      alias($._msa_keyword, 'msa'),
      alias($._nfact_keyword, 'nfact'),
      alias($._nfactors_keyword, 'nfactors'),
      alias($._nobs_keyword, 'nobs'),
      alias($._nocorr_keyword, 'nocorr'),
      alias($._noint_keyword, 'noint'),
      alias($._noprint_keyword, 'noprint'),
      alias($._nopromaxnorm_keyword, 'nopromaxnorm'),
      alias($._norm_keyword, 'norm'),
      alias($._nplot_keyword, 'nplot'),
      alias($._nplots_keyword, 'nplots'),
      alias($._out_keyword, 'out'),
      alias($._outstat_keyword, 'outstat'),
      alias($._parprefix_keyword, 'parprefix'),
      alias($._percent_keyword, 'percent'),
      alias($._plot_keyword, 'plot'),
      alias($._plotref_keyword, 'plotref'),
      alias($._plots_keyword, 'plots'),
      alias($._power_keyword, 'power'),
      alias($._pre_keyword, 'pre'),
      alias($._prefix_keyword, 'prefix'),
      alias($._preplot_keyword, 'preplot'),
      alias($._prerotate_keyword, 'prerotate'),
      alias($._print_keyword, 'print'),
      alias($._priors_keyword, 'priors'),
      alias($._proportion_keyword, 'proportion'),
      alias($._random_keyword, 'random'),
      alias($._rconv_keyword, 'rconv'),
      alias($._rconverge_keyword, 'rconverge'),
      alias($._re_keyword, 're'),
      alias($._reorder_keyword, 'reorder'),
      alias($._res_keyword, 'res'),
      alias($._residuals_keyword, 'residuals'),
      alias($._riter_keyword, 'riter'),
      alias($._rotate_keyword, 'rotate'),
      alias($._round_keyword, 'round'),
      alias($._score_keyword, 'score'),
      alias($._scree_keyword, 'scree'),
      alias($._se_keyword, 'se'),
      alias($._simple_keyword, 'simple'),
      alias($._sing_keyword, 'sing'),
      alias($._singular_keyword, 'singular'),
      alias($._stderr_keyword, 'stderr'),
      alias($._target_keyword, 'target'),
      alias($._tau_keyword, 'tau'),
      alias($._ultra_keyword, 'ultra'),
      alias($._ultraheywood_keyword, 'ultraheywood'),
      alias($._vardef_keyword, 'vardef'),
      alias($._weight_keyword, 'weight'),
      $.identifier,
    ),

    // --- PROC PRINCOMP per-proc struct (Phase 3 D) ---
    proc_princomp_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_princomp_keyword, 'princomp'),
      optional(field('options', $.princomp_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    princomp_options: $ => repeat1(choice(
      $.princomp_option,
      $.identifier,
    )),

    princomp_option: $ => seq(
      $.princomp_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    princomp_option_key: $ => choice(
      alias($._cov_keyword, 'cov'),
      alias($._covariance_keyword, 'covariance'),
      alias($._data_keyword, 'data'),
      alias($._noint_keyword, 'noint'),
      alias($._noprint_keyword, 'noprint'),
      alias($._out_keyword, 'out'),
      alias($._outstat_keyword, 'outstat'),
      alias($._parprefix_keyword, 'parprefix'),
      alias($._plots_keyword, 'plots'),
      alias($._pprefix_keyword, 'pprefix'),
      alias($._prefix_keyword, 'prefix'),
      alias($._sing_keyword, 'sing'),
      alias($._singular_keyword, 'singular'),
      alias($._standard_keyword, 'standard'),
      alias($._std_keyword, 'std'),
      alias($._vardef_keyword, 'vardef'),
      $.identifier,
    ),

    // --- PROC LOGISTIC per-proc struct (Phase 3 D) ---
    proc_logistic_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_logistic_keyword, 'logistic'),
      optional(field('options', $.logistic_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    logistic_options: $ => repeat1(choice(
      $.logistic_option,
      $.identifier,
    )),

    logistic_option: $ => seq(
      $.logistic_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    logistic_option_key: $ => choice(
      alias($._alpha_keyword, 'alpha'),
      alias($._covout_keyword, 'covout'),
      alias($._data_keyword, 'data'),
      alias($._desc_keyword, 'desc'),
      alias($._descending_keyword, 'descending'),
      alias($._exactonly_keyword, 'exactonly'),
      alias($._exactoptions_keyword, 'exactoptions'),
      alias($._inest_keyword, 'inest'),
      alias($._inmodel_keyword, 'inmodel'),
      alias($._maxresponselevels_keyword, 'maxresponselevels'),
      alias($._multipass_keyword, 'multipass'),
      alias($._namelen_keyword, 'namelen'),
      alias($._nocov_keyword, 'nocov'),
      alias($._noprint_keyword, 'noprint'),
      alias($._order_keyword, 'order'),
      alias($._outdesign_keyword, 'outdesign'),
      alias($._outdesignonly_keyword, 'outdesignonly'),
      alias($._outest_keyword, 'outest'),
      alias($._outmodel_keyword, 'outmodel'),
      alias($._plots_keyword, 'plots'),
      alias($._rocoptions_keyword, 'rocoptions'),
      alias($._rorder_keyword, 'rorder'),
      alias($._simple_keyword, 'simple'),
      alias($._truncate_keyword, 'truncate'),
      $.identifier,
    ),

    // --- PROC TTEST per-proc struct (Phase 3 D) ---
    proc_ttest_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_ttest_keyword, 'ttest'),
      optional(field('options', $.ttest_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    ttest_options: $ => repeat1(choice(
      $.ttest_option,
      $.identifier,
    )),

    ttest_option: $ => seq(
      $.ttest_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    ttest_option_key: $ => choice(
      alias($._alpha_keyword, 'alpha'),
      alias($._byvar_keyword, 'byvar'),
      alias($._ci_keyword, 'ci'),
      alias($._cl_keyword, 'cl'),
      alias($._cochran_keyword, 'cochran'),
      alias($._data_keyword, 'data'),
      alias($._dist_keyword, 'dist'),
      alias($._h0_keyword, 'h0'),
      alias($._nobyvar_keyword, 'nobyvar'),
      alias($._order_keyword, 'order'),
      alias($._plots_keyword, 'plots'),
      alias($._side_keyword, 'side'),
      alias($._sided_keyword, 'sided'),
      alias($._sides_keyword, 'sides'),
      alias($._test_keyword, 'test'),
      alias($._tost_keyword, 'tost'),
      $.identifier,
    ),

    // --- PROC LIFETEST per-proc struct (Phase 3 D) ---
    proc_lifetest_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_lifetest_keyword, 'lifetest'),
      optional(field('options', $.lifetest_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    lifetest_options: $ => repeat1(choice(
      $.lifetest_option,
      $.identifier,
    )),

    lifetest_option: $ => seq(
      $.lifetest_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    lifetest_option_key: $ => choice(
      alias($._aalen_keyword, 'aalen'),
      alias($._alpha_keyword, 'alpha'),
      alias($._alphaqt_keyword, 'alphaqt'),
      alias($._atrisk_keyword, 'atrisk'),
      alias($._bandmax_keyword, 'bandmax'),
      alias($._bandmaxtime_keyword, 'bandmaxtime'),
      alias($._bandmin_keyword, 'bandmin'),
      alias($._bandmintime_keyword, 'bandmintime'),
      alias($._cifvar_keyword, 'cifvar'),
      alias($._confband_keyword, 'confband'),
      alias($._conftype_keyword, 'conftype'),
      alias($._data_keyword, 'data'),
      alias($._error_keyword, 'error'),
      alias($._intervals_keyword, 'intervals'),
      alias($._maxtime_keyword, 'maxtime'),
      alias($._method_keyword, 'method'),
      alias($._missing_keyword, 'missing'),
      alias($._nelson_keyword, 'nelson'),
      alias($._ninterval_keyword, 'ninterval'),
      alias($._noleft_keyword, 'noleft'),
      alias($._noprint_keyword, 'noprint'),
      alias($._notable_keyword, 'notable'),
      alias($._outcif_keyword, 'outcif'),
      alias($._outs_keyword, 'outs'),
      alias($._outsurv_keyword, 'outsurv'),
      alias($._outt_keyword, 'outt'),
      alias($._outtest_keyword, 'outtest'),
      alias($._plots_keyword, 'plots'),
      alias($._reduceout_keyword, 'reduceout'),
      alias($._singular_keyword, 'singular'),
      alias($._stderr_keyword, 'stderr'),
      alias($._timelim_keyword, 'timelim'),
      alias($._timelist_keyword, 'timelist'),
      alias($._width_keyword, 'width'),
      $.identifier,
    ),

    // --- PROC UNIVARIATE per-proc struct (Phase 3 D) ---
    proc_univariate_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_univariate_keyword, 'univariate'),
      optional(field('options', $.univariate_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    univariate_options: $ => repeat1(choice(
      $.univariate_option,
      $.identifier,
    )),

    univariate_option: $ => seq(
      $.univariate_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    univariate_option_key: $ => choice(
      alias($._all_keyword, 'all'),
      alias($._alpha_keyword, 'alpha'),
      alias($._anno_keyword, 'anno'),
      alias($._annotate_keyword, 'annotate'),
      alias($._cibasic_keyword, 'cibasic'),
      alias($._cipctldf_keyword, 'cipctldf'),
      alias($._cipctlnormal_keyword, 'cipctlnormal'),
      alias($._ciquantdf_keyword, 'ciquantdf'),
      alias($._ciquantnormal_keyword, 'ciquantnormal'),
      alias($._data_keyword, 'data'),
      alias($._def_keyword, 'def'),
      alias($._exclnpwgt_keyword, 'exclnpwgt'),
      alias($._exclnpwgts_keyword, 'exclnpwgts'),
      alias($._freq_keyword, 'freq'),
      alias($._gout_keyword, 'gout'),
      alias($._idout_keyword, 'idout'),
      alias($._location_keyword, 'location'),
      alias($._loccount_keyword, 'loccount'),
      alias($._mode_keyword, 'mode'),
      alias($._modes_keyword, 'modes'),
      alias($._mu0_keyword, 'mu0'),
      alias($._nextrobs_keyword, 'nextrobs'),
      alias($._nextrval_keyword, 'nextrval'),
      alias($._nobyplot_keyword, 'nobyplot'),
      alias($._noprint_keyword, 'noprint'),
      alias($._normal_keyword, 'normal'),
      alias($._normaltest_keyword, 'normaltest'),
      alias($._notabcontents_keyword, 'notabcontents'),
      alias($._novarcontents_keyword, 'novarcontents'),
      alias($._outtable_keyword, 'outtable'),
      alias($._pctldef_keyword, 'pctldef'),
      alias($._plot_keyword, 'plot'),
      alias($._plots_keyword, 'plots'),
      alias($._plotsize_keyword, 'plotsize'),
      alias($._robustscale_keyword, 'robustscale'),
      alias($._round_keyword, 'round'),
      alias($._summarycontents_keyword, 'summarycontents'),
      alias($._trim_keyword, 'trim'),
      alias($._trimmed_keyword, 'trimmed'),
      alias($._vardef_keyword, 'vardef'),
      alias($._winsor_keyword, 'winsor'),
      alias($._winsorized_keyword, 'winsorized'),
      $.identifier,
    ),

    // --- PROC SGPLOT per-proc struct (Phase 3 D) ---
    proc_sgplot_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_sgplot_keyword, 'sgplot'),
      optional(field('options', $.sgplot_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    sgplot_options: $ => repeat1(choice(
      $.sgplot_option,
      $.identifier,
    )),

    sgplot_option: $ => seq(
      $.sgplot_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    sgplot_option_key: $ => choice(
      alias($._aspect_keyword, 'aspect'),
      alias($._cycleattrs_keyword, 'cycleattrs'),
      alias($._data_keyword, 'data'),
      alias($._dattrmap_keyword, 'dattrmap'),
      alias($._des_keyword, 'des'),
      alias($._description_keyword, 'description'),
      alias($._noautolegend_keyword, 'noautolegend'),
      alias($._noborder_keyword, 'noborder'),
      alias($._nocycleattrs_keyword, 'nocycleattrs'),
      alias($._noopaque_keyword, 'noopaque'),
      alias($._nosubpixel_keyword, 'nosubpixel'),
      alias($._nowall_keyword, 'nowall'),
      alias($._opaque_keyword, 'opaque'),
      alias($._pad_keyword, 'pad'),
      alias($._pctlevel_keyword, 'pctlevel'),
      alias($._pctndec_keyword, 'pctndec'),
      alias($._rattrmap_keyword, 'rattrmap'),
      alias($._sganno_keyword, 'sganno'),
      alias($._subpixel_keyword, 'subpixel'),
      alias($._tmplout_keyword, 'tmplout'),
      alias($._uniform_keyword, 'uniform'),
      $.identifier,
    ),

    // --- PROC GPLOT per-proc struct (Phase 3 D) ---
    proc_gplot_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_gplot_keyword, 'gplot'),
      optional(field('options', $.gplot_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    gplot_options: $ => repeat1(choice(
      $.gplot_option,
      $.identifier,
    )),

    gplot_option: $ => seq(
      $.gplot_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    gplot_option_key: $ => choice(
      alias($._anno_keyword, 'anno'),
      alias($._annotate_keyword, 'annotate'),
      alias($._data_keyword, 'data'),
      alias($._gout_keyword, 'gout'),
      alias($._imagemap_keyword, 'imagemap'),
      alias($._uniform_keyword, 'uniform'),
      $.identifier,
    ),

    // --- PROC FORMAT per-proc struct (Phase 3 D) ---
    proc_format_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_format_keyword, 'format'),
      optional(field('options', $.format_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    format_options: $ => repeat1(choice(
      $.format_option,
      $.identifier,
    )),

    format_option: $ => seq(
      $.format_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    format_option_key: $ => choice(
      alias($._casfmtlib_keyword, 'casfmtlib'),
      alias($._cntlin_keyword, 'cntlin'),
      alias($._cntlout_keyword, 'cntlout'),
      alias($._fmtlib_keyword, 'fmtlib'),
      alias($._lib_keyword, 'lib'),
      alias($._library_keyword, 'library'),
      alias($._locale_keyword, 'locale'),
      alias($._maxlablen_keyword, 'maxlablen'),
      alias($._maxselen_keyword, 'maxselen'),
      alias($._noreplace_keyword, 'noreplace'),
      alias($._page_keyword, 'page'),
      $.identifier,
    ),

    // --- PROC FCMP per-proc struct (Phase 3 D) ---
    proc_fcmp_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_fcmp_keyword, 'fcmp'),
      optional(field('options', $.fcmp_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    fcmp_options: $ => repeat1(choice(
      $.fcmp_option,
      $.identifier,
    )),

    fcmp_option: $ => seq(
      $.fcmp_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    fcmp_option_key: $ => choice(
      alias($._data_keyword, 'data'),
      alias($._encrypt_keyword, 'encrypt'),
      alias($._flow_keyword, 'flow'),
      alias($._getcascmplib_keyword, 'getcascmplib'),
      alias($._getcascmpopt_keyword, 'getcascmpopt'),
      alias($._getcmplib_keyword, 'getcmplib'),
      alias($._getcmpopt_keyword, 'getcmpopt'),
      alias($._hide_keyword, 'hide'),
      alias($._inlib_keyword, 'inlib'),
      alias($._library_keyword, 'library'),
      alias($._list_keyword, 'list'),
      alias($._listall_keyword, 'listall'),
      alias($._listcode_keyword, 'listcode'),
      alias($._listfuncs_keyword, 'listfuncs'),
      alias($._listprog_keyword, 'listprog'),
      alias($._listsource_keyword, 'listsource'),
      alias($._out_keyword, 'out'),
      alias($._outfile_keyword, 'outfile'),
      alias($._outitemstore_keyword, 'outitemstore'),
      alias($._outlib_keyword, 'outlib'),
      alias($._print_keyword, 'print'),
      alias($._setcascmplib_keyword, 'setcascmplib'),
      alias($._setcascmpopt_keyword, 'setcascmpopt'),
      alias($._setcmplib_keyword, 'setcmplib'),
      alias($._setcmpopt_keyword, 'setcmpopt'),
      alias($._trace_keyword, 'trace'),
      $.identifier,
    ),

    // --- PROC SQL per-proc struct (Phase 3 D) ---
    proc_sql_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_sql_keyword, 'sql'),
      optional(field('options', $.sql_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    sql_options: $ => repeat1(choice(
      $.sql_option,
      $.identifier,
    )),

    sql_option: $ => seq(
      $.sql_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    sql_option_key: $ => choice(
      alias($._constdatetime_keyword, 'constdatetime'),
      alias($._dictdiag_keyword, 'dictdiag'),
      alias($._double_keyword, 'double'),
      alias($._dquote_keyword, 'dquote'),
      alias($._errorstop_keyword, 'errorstop'),
      alias($._exec_keyword, 'exec'),
      alias($._exitcode_keyword, 'exitcode'),
      alias($._feedback_keyword, 'feedback'),
      alias($._flow_keyword, 'flow'),
      alias($._inobs_keyword, 'inobs'),
      alias($._ipassthru_keyword, 'ipassthru'),
      alias($._loops_keyword, 'loops'),
      alias($._noconstdatetime_keyword, 'noconstdatetime'),
      alias($._nodictdiag_keyword, 'nodictdiag'),
      alias($._nodouble_keyword, 'nodouble'),
      alias($._noerrorstop_keyword, 'noerrorstop'),
      alias($._noexec_keyword, 'noexec'),
      alias($._nofeedback_keyword, 'nofeedback'),
      alias($._noipassthru_keyword, 'noipassthru'),
      alias($._nonumber_keyword, 'nonumber'),
      alias($._noprint_keyword, 'noprint'),
      alias($._noprompt_keyword, 'noprompt'),
      alias($._noremerge_keyword, 'noremerge'),
      alias($._nosortmsg_keyword, 'nosortmsg'),
      alias($._nostimer_keyword, 'nostimer'),
      alias($._nothreads_keyword, 'nothreads'),
      alias($._nowarnrecurs_keyword, 'nowarnrecurs'),
      alias($._number_keyword, 'number'),
      alias($._outobs_keyword, 'outobs'),
      alias($._print_keyword, 'print'),
      alias($._prompt_keyword, 'prompt'),
      alias($._reduceput_keyword, 'reduceput'),
      alias($._reduceputobs_keyword, 'reduceputobs'),
      alias($._reduceputvalues_keyword, 'reduceputvalues'),
      alias($._remerge_keyword, 'remerge'),
      alias($._sortmsg_keyword, 'sortmsg'),
      alias($._sortseq_keyword, 'sortseq'),
      alias($._stimer_keyword, 'stimer'),
      alias($._stopontrunc_keyword, 'stopontrunc'),
      alias($._threads_keyword, 'threads'),
      alias($._ubufsize_keyword, 'ubufsize'),
      alias($._undo_policy_keyword, 'undo_policy'),
      alias($._warnrecurs_keyword, 'warnrecurs'),
      $.identifier,
    ),

    // --- PROC REPORT per-proc struct (Phase 3 D) ---
    proc_report_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_report_keyword, 'report'),
      optional(field('options', $.report_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    report_options: $ => repeat1(choice(
      $.report_option,
      $.identifier,
    )),

    report_option: $ => seq(
      $.report_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    report_option_key: $ => choice(
      alias($._bypageno_keyword, 'bypageno'),
      alias($._caption_keyword, 'caption'),
      alias($._center_keyword, 'center'),
      alias($._completecols_keyword, 'completecols'),
      alias($._completerows_keyword, 'completerows'),
      alias($._contents_keyword, 'contents'),
      alias($._data_keyword, 'data'),
      alias($._exclnpwgt_keyword, 'exclnpwgt'),
      alias($._exclnpwgts_keyword, 'exclnpwgts'),
      alias($._list_keyword, 'list'),
      alias($._missing_keyword, 'missing'),
      alias($._named_keyword, 'named'),
      alias($._noalias_keyword, 'noalias'),
      alias($._nocenter_keyword, 'nocenter'),
      alias($._nocompletecols_keyword, 'nocompletecols'),
      alias($._nocompleterows_keyword, 'nocompleterows'),
      alias($._noexec_keyword, 'noexec'),
      alias($._noexecute_keyword, 'noexecute'),
      alias($._noheader_keyword, 'noheader'),
      alias($._nothreads_keyword, 'nothreads'),
      alias($._out_keyword, 'out'),
      alias($._outrept_keyword, 'outrept'),
      alias($._pctldef_keyword, 'pctldef'),
      alias($._qmarkers_keyword, 'qmarkers'),
      alias($._qmethod_keyword, 'qmethod'),
      alias($._qntldef_keyword, 'qntldef'),
      alias($._report_keyword, 'report'),
      alias($._showall_keyword, 'showall'),
      alias($._spanrows_keyword, 'spanrows'),
      alias($._split_keyword, 'split'),
      alias($._style_keyword, 'style'),
      alias($._threads_keyword, 'threads'),
      alias($._vardef_keyword, 'vardef'),
      $.identifier,
    ),

    // --- PROC TABULATE per-proc struct (Phase 3 D) ---
    proc_tabulate_step: $ => seq(
      alias($._proc_keyword, 'proc'),
      alias($._proc_tabulate_keyword, 'tabulate'),
      optional(field('options', $.tabulate_options)),
      ';',
      optional(field('body', $.proc_body)),
      optional(choice(
        seq(alias($._run_keyword, 'run'), optional(choice('cancel', 'CANCEL')), ';'),
        seq(alias($._quit_keyword, 'quit'), optional(choice('cancel', 'CANCEL')), ';'),
      )),
    ),

    tabulate_options: $ => repeat1(choice(
      $.tabulate_option,
      $.identifier,
    )),

    tabulate_option: $ => seq(
      $.tabulate_option_key,
      optional($.proc_option_args),
      optional(seq('=',
        choice($.catalog_path, $.expression),
        optional($.data_set_option),
      )),
    ),

    tabulate_option_key: $ => choice(
      alias($._alpha_keyword, 'alpha'),
      alias($._classdata_keyword, 'classdata'),
      alias($._contents_keyword, 'contents'),
      alias($._data_keyword, 'data'),
      alias($._exclnpwgt_keyword, 'exclnpwgt'),
      alias($._exclnpwgts_keyword, 'exclnpwgts'),
      alias($._exclusive_keyword, 'exclusive'),
      alias($._format_keyword, 'format'),
      alias($._formchar_keyword, 'formchar'),
      alias($._missing_keyword, 'missing'),
      alias($._noseps_keyword, 'noseps'),
      alias($._nothreads_keyword, 'nothreads'),
      alias($._order_keyword, 'order'),
      alias($._out_keyword, 'out'),
      alias($._pctldef_keyword, 'pctldef'),
      alias($._qmarkers_keyword, 'qmarkers'),
      alias($._qmethod_keyword, 'qmethod'),
      alias($._qntldef_keyword, 'qntldef'),
      alias($._style_keyword, 'style'),
      alias($._threads_keyword, 'threads'),
      alias($._trap_keyword, 'trap'),
      alias($._vardef_keyword, 'vardef'),
      $.identifier,
    ),

    proc_generic_step: $ => seq(
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
      alias($._in_keyword, 'in'),
      alias($._library_keyword, 'library'),
      alias($._file_keyword, 'file'),
      alias($._memtype_keyword, 'memtype'),
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
      // PROC TTEST / LIFETEST statements
      $.ttest_paired_statement,
      $.lifetest_time_statement,
      $.lifetest_strata_statement,
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
        // Iterative range: do i = 1 to 10 [by 2];
        seq($.identifier, '=', $.expression, alias($._to_keyword, 'to'), $.expression, optional(seq(alias($._by_keyword, 'by'), $.expression))),
        // Item-list iterator: do pointnum = 1, 3, 5;  (comma-separated values)
        seq($.identifier, '=', $.expression, repeat1(seq(',', $.expression))),
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
        seq('(', repeat(seq(
          $.identifier,                                   // column name
          optional($.identifier),                         // type: char, num, int, varchar
          optional(seq('(', repeat(choice($.identifier, $.number, ',')), ')')),  // (width) or (width, dec)
          optional(',')
        )), ')')
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
    means_class_statement: $ => seq('class', repeat1(choice(
      // Class variable may carry a parenthesized option group: trt(ref='Placebo'),
      // sex(ref='M'). Used by PROC LOGISTIC/GENMOD for reference/param coding.
      seq($.identifier, optional(seq('(', repeat(choice($.identifier, '=', $.quoted_string)), ')'))),
      $.macro_variable_reference,
    )), optional($._class_slash_options), ';'),
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
    // exact chisq / mc n=10000; — exact-test keyword(s) followed by optional
    // slash-options (mc n=, alpha=, maxtime=).
    freq_exact_statement: $ => seq('exact', repeat1(choice($.identifier, $.macro_variable_reference)), optional($._class_slash_options), ';'),
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
    // Slash-options for UNIVARIATE plot statements (histogram/probplot/qqplot/
    // cdfplot). Accepts bare distribution keywords (normal, lognormal, kernel),
    // keyword=value pairs, and parenthesized parameter groups after a keyword:
    //   normal(mu=est sigma=est)     exponential(scale=est)
    //   weibull(c=est)               lognormal(sigma=est theta=est)
    _plot_slash_options: $ => seq('/', repeat1(choice(
      $.identifier,
      seq($.identifier, '=', $.expression),
      seq($.identifier, '(', repeat(choice($.identifier, '=', $.number, ',')), ')'),
    ))),
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
    univariate_histogram_statement: $ => seq('histogram', repeat1(choice($.identifier, $.macro_variable_reference)), optional($._plot_slash_options), ';'),
    // probplot bmi / normal(mu=est sigma=est); — distribution option with a
    // parenthesized parameter group follows the slash.
    univariate_probplot_statement: $ => seq('probplot', repeat1(choice($.identifier, $.macro_variable_reference)), optional($._plot_slash_options), ';'),
    univariate_qqplot_statement: $ => seq('qqplot', repeat1(choice($.identifier, $.macro_variable_reference)), optional($._plot_slash_options), ';'),
    univariate_cdfplot_statement: $ => seq('cdfplot', repeat1(choice($.identifier, $.macro_variable_reference)), optional($._plot_slash_options), ';'),
    univariate_output_statement: $ => seq('output', optional(seq('out', '=', $.data_reference)), repeat(choice($.identifier, seq($.identifier, '=', $.identifier))), ';'),
    univariate_inset_statement: $ => seq('inset', repeat1(choice($.identifier, $.quoted_string)), ';'),

    // ========================================================================
    // PROC TTEST / LIFETEST statements
    // ========================================================================

    // TTEST paired: `paired baseline*week12;` or `paired pre*post / options;`.
    // The asterisk joins the paired variables; options follow an optional slash.
    ttest_paired_statement: $ => seq(
      'paired',
      $.identifier, '*', $.identifier,
      repeat(seq('*', $.identifier)),
      optional($._class_slash_options),
      ';'
    ),

    // LIFETEST time: `time survtime * censor(0);` — survival time crossed with
    // a censoring variable whose parentheses list the censoring values.
    lifetest_time_statement: $ => seq(
      'time',
      $.identifier, '*', $.identifier,
      optional(seq('(', repeat(choice($.identifier, $.number, ',')), ')')),
      ';'
    ),

    // LIFETEST strata: `strata trt / test=(logrank wilcoxon);` — the stratum
    // variable(s) with optional slash-options (test=, order=, missing, etc.).
    lifetest_strata_statement: $ => seq(
      'strata',
      repeat1(choice($.identifier, $.macro_variable_reference)),
      optional($._class_slash_options),
      ';'
    ),

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
    // PROC COPY proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_copy_step.
    _proc_copy_keyword: $ => /[cC][oO][pP][yY]/,
    // PROC CPORT proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_cport_step (Phase 3 B2).
    _proc_cport_keyword: $ => /[cC][pP][oO][rR][tT]/,
    // PROC CIMPORT proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_cimport_step (Phase 3 B3).
    _proc_cimport_keyword: $ => /[cC][iI][mM][pP][oO][rR][tT]/,
    // PROC DATASETS proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_datasets_step (Phase 3 C2 / Task 12).
    _proc_datasets_keyword: $ => /[dD][aA][tT][aA][sS][eE][tT][sS]/,
    // PROC APPEND proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_append_step (Phase 3 C3 / Task 13).
    _proc_append_keyword: $ => /[aA][pP][pP][eE][nN][dD]/,
    // PROC STANDARD proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_standard_step (Phase 3 C3 / Task 14).
    _proc_standard_keyword: $ => /[sS][tT][aA][nN][dD][aA][rR][dD]/,
    // PROC PRINTTO proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_printto_step (Phase 3 C3 / Task 15).
    _proc_printto_keyword: $ => /[pP][rR][iI][nN][tT][tT][oO]/,
    // PROC TRANSPOSE proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_transpose_step (Phase 3 C3 / Task 16).
    _proc_transpose_keyword: $ => /[tT][rR][aA][nN][sS][pP][oO][sS][eE]/,
    // PROC CONTENTS proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_contents_step (Phase 3 C3 / Task 17).
    _proc_contents_keyword: $ => /[cC][oO][nN][tT][eE][nN][tT][sS]/,
    // PROC COMPARE proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_compare_step (Phase 3 C3 / Task 18).
    _proc_compare_keyword: $ => /[cC][oO][mM][pP][aA][rR][eE]/,
    // PROC FREQ proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_freq_step (Phase 3 C3 / Task 22).
    _proc_freq_keyword: $ => /[fF][rR][eE][qQ]/,
    // PROC OPTIONS proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_options_step (Phase 3 C3 / Task 19).
    _proc_options_keyword: $ => /[oO][pP][tT][iI][oO][nN][sS]/,
    // PROC PRINT proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier (and from _proc_printto_keyword) so the dispatcher can
    // route to proc_print_step (Phase 3 C3 / Task 20).
    _proc_print_keyword: $ => /[pP][rR][iI][nN][tT]/,
    // PROC MEANS proc-name token (dispatched on by proc_step). Distinct from a
    // bare identifier so the dispatcher can route to proc_means_step (Phase 3 C3 / Task 21).
    _proc_means_keyword: $ => /[mM][eE][aA][nN][sS]/,

    _proc_reg_keyword: $ => /[Rr][Ee][Gg]/,
    _proc_glm_keyword: $ => /[Gg][Ll][Mm]/,
    _proc_mixed_keyword: $ => /[Mm][Ii][Xx][Ee][Dd]/,
    _proc_anova_keyword: $ => /[Aa][Nn][Oo][Vv][Aa]/,
    _proc_phreg_keyword: $ => /[Pp][Hh][Rr][Ee][Gg]/,
    _proc_genmod_keyword: $ => /[Gg][Ee][Nn][Mm][Oo][Dd]/,
    _proc_factor_keyword: $ => /[Ff][Aa][Cc][Tt][Oo][Rr]/,
    _proc_princomp_keyword: $ => /[Pp][Rr][Ii][Nn][Cc][Oo][Mm][Pp]/,
    _proc_logistic_keyword: $ => /[Ll][Oo][Gg][Ii][Ss][Tt][Ii][Cc]/,
    _proc_ttest_keyword: $ => /[Tt][Tt][Ee][Ss][Tt]/,
    _proc_lifetest_keyword: $ => /[Ll][Ii][Ff][Ee][Tt][Ee][Ss][Tt]/,
    _proc_univariate_keyword: $ => /[Uu][Nn][Ii][Vv][Aa][Rr][Ii][Aa][Tt][Ee]/,
    _proc_sgplot_keyword: $ => /[Ss][Gg][Pp][Ll][Oo][Tt]/,
    _proc_gplot_keyword: $ => /[Gg][Pp][Ll][Oo][Tt]/,
    _proc_format_keyword: $ => /[Ff][Oo][Rr][Mm][Aa][Tt]/,
    _proc_fcmp_keyword: $ => /[Ff][Cc][Mm][Pp]/,
    _proc_sql_keyword: $ => /[Ss][Qq][Ll]/,
    _proc_report_keyword: $ => /[Rr][Ee][Pp][Oo][Rr][Tt]/,
    _proc_tabulate_keyword: $ => /[Tt][Aa][Bb][Uu][Ll][Aa][Tt][Ee]/,
    // --- Phase D new shared option keywords (first-use declarations) ---
    _annotate_keyword: $ => /[Aa][Nn][Nn][Oo][Tt][Aa][Tt][Ee]/,
    _corr_keyword: $ => /[Cc][Oo][Rr][Rr]/,
    _covout_keyword: $ => /[Cc][Oo][Vv][Oo][Uu][Tt]/,
    _edf_keyword: $ => /[Ee][Dd][Ff]/,
    _gout_keyword: $ => /[Gg][Oo][Uu][Tt]/,
    _lineprinter_keyword: $ => /[Ll][Ii][Nn][Ee][Pp][Rr][Ii][Nn][Tt][Ee][Rr]/,
    _outseb_keyword: $ => /[Oo][Uu][Tt][Ss][Ee][Bb]/,
    _outsscp_keyword: $ => /[Oo][Uu][Tt][Ss][Ss][Cc][Pp]/,
    _outstb_keyword: $ => /[Oo][Uu][Tt][Ss][Tt][Bb]/,
    _outvif_keyword: $ => /[Oo][Uu][Tt][Vv][Ii][Ff]/,
    _pcomit_keyword: $ => /[Pp][Cc][Oo][Mm][Ii][Tt]/,
    _plots_keyword: $ => /[Pp][Ll][Oo][Tt][Ss]/,
    _press_keyword: $ => /[Pp][Rr][Ee][Ss][Ss]/,
    _ridge_keyword: $ => /[Rr][Ii][Dd][Gg][Ee]/,
    _rsquare_keyword: $ => /[Rr][Ss][Qq][Uu][Aa][Rr][Ee]/,
    _simple_keyword: $ => /[Ss][Ii][Mm][Pp][Ll][Ee]/,
    _singular_keyword: $ => /[Ss][Ii][Nn][Gg][Uu][Ll][Aa][Rr]/,
    _tableout_keyword: $ => /[Tt][Aa][Bb][Ll][Ee][Oo][Uu][Tt]/,
    _usscp_keyword: $ => /[Uu][Ss][Ss][Cc][Pp]/,
    _manova_keyword: $ => /[Mm][Aa][Nn][Oo][Vv][Aa]/,
    _multipass_keyword: $ => /[Mm][Uu][Ll][Tt][Ii][Pp][Aa][Ss][Ss]/,
    _namelen_keyword: $ => /[Nn][Aa][Mm][Ee][Ll][Ee][Nn]/,
    _outstat_keyword: $ => /[Oo][Uu][Tt][Ss][Tt][Aa][Tt]/,
    _absolute_keyword: $ => /[Aa][Bb][Ss][Oo][Ll][Uu][Tt][Ee]/,
    _anovaf_keyword: $ => /[Aa][Nn][Oo][Vv][Aa][Ff]/,
    _asycorr_keyword: $ => /[Aa][Ss][Yy][Cc][Oo][Rr][Rr]/,
    _asycov_keyword: $ => /[Aa][Ss][Yy][Cc][Oo][Vv]/,
    _cl_keyword: $ => /[Cc][Ll]/,
    _convf_keyword: $ => /[Cc][Oo][Nn][Vv][Ff]/,
    _convg_keyword: $ => /[Cc][Oo][Nn][Vv][Gg]/,
    _convh_keyword: $ => /[Cc][Oo][Nn][Vv][Hh]/,
    _covtest_keyword: $ => /[Cc][Oo][Vv][Tt][Ee][Ss][Tt]/,
    _dfbw_keyword: $ => /[Dd][Ff][Bb][Ww]/,
    _empirical_keyword: $ => /[Ee][Mm][Pp][Ii][Rr][Ii][Cc][Aa][Ll]/,
    _ic_keyword: $ => /[Ii][Cc]/,
    _info_keyword: $ => /[Ii][Nn][Ff][Oo]/,
    _itdetails_keyword: $ => /[Ii][Tt][Dd][Ee][Tt][Aa][Ii][Ll][Ss]/,
    _lognote_keyword: $ => /[Ll][Oo][Gg][Nn][Oo][Tt][Ee]/,
    _maxfunc_keyword: $ => /[Mm][Aa][Xx][Ff][Uu][Nn][Cc]/,
    _maxiter_keyword: $ => /[Mm][Aa][Xx][Ii][Tt][Ee][Rr]/,
    _mmeq_keyword: $ => /[Mm][Mm][Ee][Qq]/,
    _mmeqsol_keyword: $ => /[Mm][Mm][Ee][Qq][Ss][Oo][Ll]/,
    _nobound_keyword: $ => /[Nn][Oo][Bb][Oo][Uu][Nn][Dd]/,
    _noclprint_keyword: $ => /[Nn][Oo][Cc][Ll][Pp][Rr][Ii][Nn][Tt]/,
    _noinfo_keyword: $ => /[Nn][Oo][Ii][Nn][Ff][Oo]/,
    _noitprint_keyword: $ => /[Nn][Oo][Ii][Tt][Pp][Rr][Ii][Nn][Tt]/,
    _noprofile_keyword: $ => /[Nn][Oo][Pp][Rr][Oo][Ff][Ii][Ll][Ee]/,
    _ord_keyword: $ => /[Oo][Rr][Dd]/,
    _ranks_keyword: $ => /[Rr][Aa][Nn][Kk][Ss]/,
    _ratio_keyword: $ => /[Rr][Aa][Tt][Ii][Oo]/,
    _scoring_keyword: $ => /[Ss][Cc][Oo][Rr][Ii][Nn][Gg]/,
    _sigiter_keyword: $ => /[Ss][Ii][Gg][Ii][Tt][Ee][Rr]/,
    _atrisk_keyword: $ => /[Aa][Tt][Rr][Ii][Ss][Kk]/,
    _covm_keyword: $ => /[Cc][Oo][Vv][Mm]/,
    _covs_keyword: $ => /[Cc][Oo][Vv][Ss]/,
    _covsandwich_keyword: $ => /[Cc][Oo][Vv][Ss][Aa][Nn][Dd][Ww][Ii][Cc][Hh]/,
    _inest_keyword: $ => /[Ii][Nn][Ee][Ss][Tt]/,
    _desc_keyword: $ => /[Dd][Ee][Ss][Cc]/,
    _rorder_keyword: $ => /[Rr][Oo][Rr][Dd][Ee][Rr]/,
    _ci_keyword: $ => /[Cc][Ii]/,
    _conv_keyword: $ => /[Cc][Oo][Nn][Vv]/,
    _converge_keyword: $ => /[Cc][Oo][Nn][Vv][Ee][Rr][Gg][Ee]/,
    _cov_keyword: $ => /[Cc][Oo][Vv]/,
    _covariance_keyword: $ => /[Cc][Oo][Vv][Aa][Rr][Ii][Aa][Nn][Cc][Ee]/,
    _cover_keyword: $ => /[Cc][Oo][Vv][Ee][Rr]/,
    _eigenvectors_keyword: $ => /[Ee][Ii][Gg][Ee][Nn][Vv][Ee][Cc][Tt][Oo][Rr][Ss]/,
    _ev_keyword: $ => /[Ee][Vv]/,
    _flag_keyword: $ => /[Ff][Ll][Aa][Gg]/,
    _gamma_keyword: $ => /[Gg][Aa][Mm][Mm][Aa]/,
    _hey_keyword: $ => /[Hh][Ee][Yy]/,
    _heywood_keyword: $ => /[Hh][Ee][Yy][Ww][Oo][Oo][Dd]/,
    _hkp_keyword: $ => /[Hh][Kk][Pp]/,
    _hkpower_keyword: $ => /[Hh][Kk][Pp][Oo][Ww][Ee][Rr]/,
    _mineigen_keyword: $ => /[Mm][Ii][Nn][Ee][Ii][Gg][Ee][Nn]/,
    _msa_keyword: $ => /[Mm][Ss][Aa]/,
    _nfact_keyword: $ => /[Nn][Ff][Aa][Cc][Tt]/,
    _nfactors_keyword: $ => /[Nn][Ff][Aa][Cc][Tt][Oo][Rr][Ss]/,
    _nobs_keyword: $ => /[Nn][Oo][Bb][Ss]/,
    _nocorr_keyword: $ => /[Nn][Oo][Cc][Oo][Rr][Rr]/,
    _noint_keyword: $ => /[Nn][Oo][Ii][Nn][Tt]/,
    _nopromaxnorm_keyword: $ => /[Nn][Oo][Pp][Rr][Oo][Mm][Aa][Xx][Nn][Oo][Rr][Mm]/,
    _norm_keyword: $ => /[Nn][Oo][Rr][Mm]/,
    _nplot_keyword: $ => /[Nn][Pp][Ll][Oo][Tt]/,
    _nplots_keyword: $ => /[Nn][Pp][Ll][Oo][Tt][Ss]/,
    _parprefix_keyword: $ => /[Pp][Aa][Rr][Pp][Rr][Ee][Ff][Ii][Xx]/,
    _percent_keyword: $ => /[Pp][Ee][Rr][Cc][Ee][Nn][Tt]/,
    _plot_keyword: $ => /[Pp][Ll][Oo][Tt]/,
    _plotref_keyword: $ => /[Pp][Ll][Oo][Tt][Rr][Ee][Ff]/,
    _power_keyword: $ => /[Pp][Oo][Ww][Ee][Rr]/,
    _pre_keyword: $ => /[Pp][Rr][Ee]/,
    _preplot_keyword: $ => /[Pp][Rr][Ee][Pp][Ll][Oo][Tt]/,
    _prerotate_keyword: $ => /[Pp][Rr][Ee][Rr][Oo][Tt][Aa][Tt][Ee]/,
    _priors_keyword: $ => /[Pp][Rr][Ii][Oo][Rr][Ss]/,
    _proportion_keyword: $ => /[Pp][Rr][Oo][Pp][Oo][Rr][Tt][Ii][Oo][Nn]/,
    _random_keyword: $ => /[Rr][Aa][Nn][Dd][Oo][Mm]/,
    _rconv_keyword: $ => /[Rr][Cc][Oo][Nn][Vv]/,
    _rconverge_keyword: $ => /[Rr][Cc][Oo][Nn][Vv][Ee][Rr][Gg][Ee]/,
    _re_keyword: $ => /[Rr][Ee]/,
    _reorder_keyword: $ => /[Rr][Ee][Oo][Rr][Dd][Ee][Rr]/,
    _res_keyword: $ => /[Rr][Ee][Ss]/,
    _residuals_keyword: $ => /[Rr][Ee][Ss][Ii][Dd][Uu][Aa][Ll][Ss]/,
    _riter_keyword: $ => /[Rr][Ii][Tt][Ee][Rr]/,
    _rotate_keyword: $ => /[Rr][Oo][Tt][Aa][Tt][Ee]/,
    _score_keyword: $ => /[Ss][Cc][Oo][Rr][Ee]/,
    _scree_keyword: $ => /[Ss][Cc][Rr][Ee][Ee]/,
    _se_keyword: $ => /[Ss][Ee]/,
    _sing_keyword: $ => /[Ss][Ii][Nn][Gg]/,
    _target_keyword: $ => /[Tt][Aa][Rr][Gg][Ee][Tt]/,
    _tau_keyword: $ => /[Tt][Aa][Uu]/,
    _ultra_keyword: $ => /[Uu][Ll][Tt][Rr][Aa]/,
    _ultraheywood_keyword: $ => /[Uu][Ll][Tt][Rr][Aa][Hh][Ee][Yy][Ww][Oo][Oo][Dd]/,
    _weight_keyword: $ => /[Ww][Ee][Ii][Gg][Hh][Tt]/,
    _pprefix_keyword: $ => /[Pp][Pp][Rr][Ee][Ff][Ii][Xx]/,
    _standard_keyword: $ => /[Ss][Tt][Aa][Nn][Dd][Aa][Rr][Dd]/,
    _exactonly_keyword: $ => /[Ee][Xx][Aa][Cc][Tt][Oo][Nn][Ll][Yy]/,
    _exactoptions_keyword: $ => /[Ee][Xx][Aa][Cc][Tt][Oo][Pp][Tt][Ii][Oo][Nn][Ss]/,
    _inmodel_keyword: $ => /[Ii][Nn][Mm][Oo][Dd][Ee][Ll]/,
    _maxresponselevels_keyword: $ => /[Mm][Aa][Xx][Rr][Ee][Ss][Pp][Oo][Nn][Ss][Ee][Ll][Ee][Vv][Ee][Ll][Ss]/,
    _nocov_keyword: $ => /[Nn][Oo][Cc][Oo][Vv]/,
    _outdesign_keyword: $ => /[Oo][Uu][Tt][Dd][Ee][Ss][Ii][Gg][Nn]/,
    _outdesignonly_keyword: $ => /[Oo][Uu][Tt][Dd][Ee][Ss][Ii][Gg][Nn][Oo][Nn][Ll][Yy]/,
    _outmodel_keyword: $ => /[Oo][Uu][Tt][Mm][Oo][Dd][Ee][Ll]/,
    _rocoptions_keyword: $ => /[Rr][Oo][Cc][Oo][Pp][Tt][Ii][Oo][Nn][Ss]/,
    _truncate_keyword: $ => /[Tt][Rr][Uu][Nn][Cc][Aa][Tt][Ee]/,
    _byvar_keyword: $ => /[Bb][Yy][Vv][Aa][Rr]/,
    _cochran_keyword: $ => /[Cc][Oo][Cc][Hh][Rr][Aa][Nn]/,
    _dist_keyword: $ => /[Dd][Ii][Ss][Tt]/,
    _h0_keyword: $ => /[Hh]0/,
    _nobyvar_keyword: $ => /[Nn][Oo][Bb][Yy][Vv][Aa][Rr]/,
    _side_keyword: $ => /[Ss][Ii][Dd][Ee]/,
    _sided_keyword: $ => /[Ss][Ii][Dd][Ee][Dd]/,
    _sides_keyword: $ => /[Ss][Ii][Dd][Ee][Ss]/,
    _test_keyword: $ => /[Tt][Ee][Ss][Tt]/,
    _tost_keyword: $ => /[Tt][Oo][Ss][Tt]/,
    _aalen_keyword: $ => /[Aa][Aa][Ll][Ee][Nn]/,
    _alphaqt_keyword: $ => /[Aa][Ll][Pp][Hh][Aa][Qq][Tt]/,
    _bandmax_keyword: $ => /[Bb][Aa][Nn][Dd][Mm][Aa][Xx]/,
    _bandmaxtime_keyword: $ => /[Bb][Aa][Nn][Dd][Mm][Aa][Xx][Tt][Ii][Mm][Ee]/,
    _bandmin_keyword: $ => /[Bb][Aa][Nn][Dd][Mm][Ii][Nn]/,
    _bandmintime_keyword: $ => /[Bb][Aa][Nn][Dd][Mm][Ii][Nn][Tt][Ii][Mm][Ee]/,
    _cifvar_keyword: $ => /[Cc][Ii][Ff][Vv][Aa][Rr]/,
    _confband_keyword: $ => /[Cc][Oo][Nn][Ff][Bb][Aa][Nn][Dd]/,
    _conftype_keyword: $ => /[Cc][Oo][Nn][Ff][Tt][Yy][Pp][Ee]/,
    _intervals_keyword: $ => /[Ii][Nn][Tt][Ee][Rr][Vv][Aa][Ll][Ss]/,
    _maxtime_keyword: $ => /[Mm][Aa][Xx][Tt][Ii][Mm][Ee]/,
    _nelson_keyword: $ => /[Nn][Ee][Ll][Ss][Oo][Nn]/,
    _ninterval_keyword: $ => /[Nn][Ii][Nn][Tt][Ee][Rr][Vv][Aa][Ll]/,
    _noleft_keyword: $ => /[Nn][Oo][Ll][Ee][Ff][Tt]/,
    _notable_keyword: $ => /[Nn][Oo][Tt][Aa][Bb][Ll][Ee]/,
    _outcif_keyword: $ => /[Oo][Uu][Tt][Cc][Ii][Ff]/,
    _outs_keyword: $ => /[Oo][Uu][Tt][Ss]/,
    _outsurv_keyword: $ => /[Oo][Uu][Tt][Ss][Uu][Rr][Vv]/,
    _outt_keyword: $ => /[Oo][Uu][Tt][Tt]/,
    _outtest_keyword: $ => /[Oo][Uu][Tt][Tt][Ee][Ss][Tt]/,
    _reduceout_keyword: $ => /[Rr][Ee][Dd][Uu][Cc][Ee][Oo][Uu][Tt]/,
    _timelim_keyword: $ => /[Tt][Ii][Mm][Ee][Ll][Ii][Mm]/,
    _timelist_keyword: $ => /[Tt][Ii][Mm][Ee][Ll][Ii][Ss][Tt]/,
    _anno_keyword: $ => /[Aa][Nn][Nn][Oo]/,
    _cibasic_keyword: $ => /[Cc][Ii][Bb][Aa][Ss][Ii][Cc]/,
    _cipctldf_keyword: $ => /[Cc][Ii][Pp][Cc][Tt][Ll][Dd][Ff]/,
    _cipctlnormal_keyword: $ => /[Cc][Ii][Pp][Cc][Tt][Ll][Nn][Oo][Rr][Mm][Aa][Ll]/,
    _ciquantdf_keyword: $ => /[Cc][Ii][Qq][Uu][Aa][Nn][Tt][Dd][Ff]/,
    _ciquantnormal_keyword: $ => /[Cc][Ii][Qq][Uu][Aa][Nn][Tt][Nn][Oo][Rr][Mm][Aa][Ll]/,
    _def_keyword: $ => /[Dd][Ee][Ff]/,
    _freq_keyword: $ => /[Ff][Rr][Ee][Qq]/,
    _idout_keyword: $ => /[Ii][Dd][Oo][Uu][Tt]/,
    _location_keyword: $ => /[Ll][Oo][Cc][Aa][Tt][Ii][Oo][Nn]/,
    _loccount_keyword: $ => /[Ll][Oo][Cc][Cc][Oo][Uu][Nn][Tt]/,
    _modes_keyword: $ => /[Mm][Oo][Dd][Ee][Ss]/,
    _mu0_keyword: $ => /[Mm][Uu]0/,
    _nextrobs_keyword: $ => /[Nn][Ee][Xx][Tt][Rr][Oo][Bb][Ss]/,
    _nextrval_keyword: $ => /[Nn][Ee][Xx][Tt][Rr][Vv][Aa][Ll]/,
    _nobyplot_keyword: $ => /[Nn][Oo][Bb][Yy][Pp][Ll][Oo][Tt]/,
    _normal_keyword: $ => /[Nn][Oo][Rr][Mm][Aa][Ll]/,
    _normaltest_keyword: $ => /[Nn][Oo][Rr][Mm][Aa][Ll][Tt][Ee][Ss][Tt]/,
    _notabcontents_keyword: $ => /[Nn][Oo][Tt][Aa][Bb][Cc][Oo][Nn][Tt][Ee][Nn][Tt][Ss]/,
    _novarcontents_keyword: $ => /[Nn][Oo][Vv][Aa][Rr][Cc][Oo][Nn][Tt][Ee][Nn][Tt][Ss]/,
    _outtable_keyword: $ => /[Oo][Uu][Tt][Tt][Aa][Bb][Ll][Ee]/,
    _plotsize_keyword: $ => /[Pp][Ll][Oo][Tt][Ss][Ii][Zz][Ee]/,
    _robustscale_keyword: $ => /[Rr][Oo][Bb][Uu][Ss][Tt][Ss][Cc][Aa][Ll][Ee]/,
    _summarycontents_keyword: $ => /[Ss][Uu][Mm][Mm][Aa][Rr][Yy][Cc][Oo][Nn][Tt][Ee][Nn][Tt][Ss]/,
    _trim_keyword: $ => /[Tt][Rr][Ii][Mm]/,
    _trimmed_keyword: $ => /[Tt][Rr][Ii][Mm][Mm][Ee][Dd]/,
    _winsor_keyword: $ => /[Ww][Ii][Nn][Ss][Oo][Rr]/,
    _winsorized_keyword: $ => /[Ww][Ii][Nn][Ss][Oo][Rr][Ii][Zz][Ee][Dd]/,
    _aspect_keyword: $ => /[Aa][Ss][Pp][Ee][Cc][Tt]/,
    _cycleattrs_keyword: $ => /[Cc][Yy][Cc][Ll][Ee][Aa][Tt][Tt][Rr][Ss]/,
    _dattrmap_keyword: $ => /[Dd][Aa][Tt][Tt][Rr][Mm][Aa][Pp]/,
    _des_keyword: $ => /[Dd][Ee][Ss]/,
    _description_keyword: $ => /[Dd][Ee][Ss][Cc][Rr][Ii][Pp][Tt][Ii][Oo][Nn]/,
    _noautolegend_keyword: $ => /[Nn][Oo][Aa][Uu][Tt][Oo][Ll][Ee][Gg][Ee][Nn][Dd]/,
    _noborder_keyword: $ => /[Nn][Oo][Bb][Oo][Rr][Dd][Ee][Rr]/,
    _nocycleattrs_keyword: $ => /[Nn][Oo][Cc][Yy][Cc][Ll][Ee][Aa][Tt][Tt][Rr][Ss]/,
    _noopaque_keyword: $ => /[Nn][Oo][Oo][Pp][Aa][Qq][Uu][Ee]/,
    _nosubpixel_keyword: $ => /[Nn][Oo][Ss][Uu][Bb][Pp][Ii][Xx][Ee][Ll]/,
    _nowall_keyword: $ => /[Nn][Oo][Ww][Aa][Ll][Ll]/,
    _opaque_keyword: $ => /[Oo][Pp][Aa][Qq][Uu][Ee]/,
    _pad_keyword: $ => /[Pp][Aa][Dd]/,
    _pctlevel_keyword: $ => /[Pp][Cc][Tt][Ll][Ee][Vv][Ee][Ll]/,
    _pctndec_keyword: $ => /[Pp][Cc][Tt][Nn][Dd][Ee][Cc]/,
    _rattrmap_keyword: $ => /[Rr][Aa][Tt][Tt][Rr][Mm][Aa][Pp]/,
    _sganno_keyword: $ => /[Ss][Gg][Aa][Nn][Nn][Oo]/,
    _subpixel_keyword: $ => /[Ss][Uu][Bb][Pp][Ii][Xx][Ee][Ll]/,
    _tmplout_keyword: $ => /[Tt][Mm][Pp][Ll][Oo][Uu][Tt]/,
    _imagemap_keyword: $ => /[Ii][Mm][Aa][Gg][Ee][Mm][Aa][Pp]/,
    _casfmtlib_keyword: $ => /[Cc][Aa][Ss][Ff][Mm][Tt][Ll][Ii][Bb]/,
    _cntlin_keyword: $ => /[Cc][Nn][Tt][Ll][Ii][Nn]/,
    _cntlout_keyword: $ => /[Cc][Nn][Tt][Ll][Oo][Uu][Tt]/,
    _fmtlib_keyword: $ => /[Ff][Mm][Tt][Ll][Ii][Bb]/,
    _locale_keyword: $ => /[Ll][Oo][Cc][Aa][Ll][Ee]/,
    _maxlablen_keyword: $ => /[Mm][Aa][Xx][Ll][Aa][Bb][Ll][Ee][Nn]/,
    _maxselen_keyword: $ => /[Mm][Aa][Xx][Ss][Ee][Ll][Ee][Nn]/,
    _noreplace_keyword: $ => /[Nn][Oo][Rr][Ee][Pp][Ll][Aa][Cc][Ee]/,
    _encrypt_keyword: $ => /[Ee][Nn][Cc][Rr][Yy][Pp][Tt]/,
    _flow_keyword: $ => /[Ff][Ll][Oo][Ww]/,
    _getcascmplib_keyword: $ => /[Gg][Ee][Tt][Cc][Aa][Ss][Cc][Mm][Pp][Ll][Ii][Bb]/,
    _getcascmpopt_keyword: $ => /[Gg][Ee][Tt][Cc][Aa][Ss][Cc][Mm][Pp][Oo][Pp][Tt]/,
    _getcmplib_keyword: $ => /[Gg][Ee][Tt][Cc][Mm][Pp][Ll][Ii][Bb]/,
    _getcmpopt_keyword: $ => /[Gg][Ee][Tt][Cc][Mm][Pp][Oo][Pp][Tt]/,
    _hide_keyword: $ => /[Hh][Ii][Dd][Ee]/,
    _inlib_keyword: $ => /[Ii][Nn][Ll][Ii][Bb]/,
    _listcode_keyword: $ => /[Ll][Ii][Ss][Tt][Cc][Oo][Dd][Ee]/,
    _listfuncs_keyword: $ => /[Ll][Ii][Ss][Tt][Ff][Uu][Nn][Cc][Ss]/,
    _listprog_keyword: $ => /[Ll][Ii][Ss][Tt][Pp][Rr][Oo][Gg]/,
    _listsource_keyword: $ => /[Ll][Ii][Ss][Tt][Ss][Oo][Uu][Rr][Cc][Ee]/,
    _outitemstore_keyword: $ => /[Oo][Uu][Tt][Ii][Tt][Ee][Mm][Ss][Tt][Oo][Rr][Ee]/,
    _setcascmplib_keyword: $ => /[Ss][Ee][Tt][Cc][Aa][Ss][Cc][Mm][Pp][Ll][Ii][Bb]/,
    _setcascmpopt_keyword: $ => /[Ss][Ee][Tt][Cc][Aa][Ss][Cc][Mm][Pp][Oo][Pp][Tt]/,
    _setcmplib_keyword: $ => /[Ss][Ee][Tt][Cc][Mm][Pp][Ll][Ii][Bb]/,
    _setcmpopt_keyword: $ => /[Ss][Ee][Tt][Cc][Mm][Pp][Oo][Pp][Tt]/,
    _trace_keyword: $ => /[Tt][Rr][Aa][Cc][Ee]/,
    _constdatetime_keyword: $ => /[Cc][Oo][Nn][Ss][Tt][Dd][Aa][Tt][Ee][Tt][Ii][Mm][Ee]/,
    _dictdiag_keyword: $ => /[Dd][Ii][Cc][Tt][Dd][Ii][Aa][Gg]/,
    _dquote_keyword: $ => /[Dd][Qq][Uu][Oo][Tt][Ee]/,
    _errorstop_keyword: $ => /[Ee][Rr][Rr][Oo][Rr][Ss][Tt][Oo][Pp]/,
    _exec_keyword: $ => /[Ee][Xx][Ee][Cc]/,
    _exitcode_keyword: $ => /[Ee][Xx][Ii][Tt][Cc][Oo][Dd][Ee]/,
    _feedback_keyword: $ => /[Ff][Ee][Ee][Dd][Bb][Aa][Cc][Kk]/,
    _inobs_keyword: $ => /[Ii][Nn][Oo][Bb][Ss]/,
    _ipassthru_keyword: $ => /[Ii][Pp][Aa][Ss][Ss][Tt][Hh][Rr][Uu]/,
    _loops_keyword: $ => /[Ll][Oo][Oo][Pp][Ss]/,
    _noconstdatetime_keyword: $ => /[Nn][Oo][Cc][Oo][Nn][Ss][Tt][Dd][Aa][Tt][Ee][Tt][Ii][Mm][Ee]/,
    _nodictdiag_keyword: $ => /[Nn][Oo][Dd][Ii][Cc][Tt][Dd][Ii][Aa][Gg]/,
    _nodouble_keyword: $ => /[Nn][Oo][Dd][Oo][Uu][Bb][Ll][Ee]/,
    _noerrorstop_keyword: $ => /[Nn][Oo][Ee][Rr][Rr][Oo][Rr][Ss][Tt][Oo][Pp]/,
    _noexec_keyword: $ => /[Nn][Oo][Ee][Xx][Ee][Cc]/,
    _nofeedback_keyword: $ => /[Nn][Oo][Ff][Ee][Ee][Dd][Bb][Aa][Cc][Kk]/,
    _noipassthru_keyword: $ => /[Nn][Oo][Ii][Pp][Aa][Ss][Ss][Tt][Hh][Rr][Uu]/,
    _nonumber_keyword: $ => /[Nn][Oo][Nn][Uu][Mm][Bb][Ee][Rr]/,
    _noprompt_keyword: $ => /[Nn][Oo][Pp][Rr][Oo][Mm][Pp][Tt]/,
    _noremerge_keyword: $ => /[Nn][Oo][Rr][Ee][Mm][Ee][Rr][Gg][Ee]/,
    _nosortmsg_keyword: $ => /[Nn][Oo][Ss][Oo][Rr][Tt][Mm][Ss][Gg]/,
    _nostimer_keyword: $ => /[Nn][Oo][Ss][Tt][Ii][Mm][Ee][Rr]/,
    _nowarnrecurs_keyword: $ => /[Nn][Oo][Ww][Aa][Rr][Nn][Rr][Ee][Cc][Uu][Rr][Ss]/,
    _number_keyword: $ => /[Nn][Uu][Mm][Bb][Ee][Rr]/,
    _outobs_keyword: $ => /[Oo][Uu][Tt][Oo][Bb][Ss]/,
    _prompt_keyword: $ => /[Pp][Rr][Oo][Mm][Pp][Tt]/,
    _reduceput_keyword: $ => /[Rr][Ee][Dd][Uu][Cc][Ee][Pp][Uu][Tt]/,
    _reduceputobs_keyword: $ => /[Rr][Ee][Dd][Uu][Cc][Ee][Pp][Uu][Tt][Oo][Bb][Ss]/,
    _reduceputvalues_keyword: $ => /[Rr][Ee][Dd][Uu][Cc][Ee][Pp][Uu][Tt][Vv][Aa][Ll][Uu][Ee][Ss]/,
    _remerge_keyword: $ => /[Rr][Ee][Mm][Ee][Rr][Gg][Ee]/,
    _sortmsg_keyword: $ => /[Ss][Oo][Rr][Tt][Mm][Ss][Gg]/,
    _stimer_keyword: $ => /[Ss][Tt][Ii][Mm][Ee][Rr]/,
    _stopontrunc_keyword: $ => /[Ss][Tt][Oo][Pp][Oo][Nn][Tt][Rr][Uu][Nn][Cc]/,
    _ubufsize_keyword: $ => /[Uu][Bb][Uu][Ff][Ss][Ii][Zz][Ee]/,
    _undo_policy_keyword: $ => /[Uu][Nn][Dd][Oo]_[Pp][Oo][Ll][Ii][Cc][Yy]/,
    _warnrecurs_keyword: $ => /[Ww][Aa][Rr][Nn][Rr][Ee][Cc][Uu][Rr][Ss]/,
    _bypageno_keyword: $ => /[Bb][Yy][Pp][Aa][Gg][Ee][Nn][Oo]/,
    _caption_keyword: $ => /[Cc][Aa][Pp][Tt][Ii][Oo][Nn]/,
    _center_keyword: $ => /[Cc][Ee][Nn][Tt][Ee][Rr]/,
    _completecols_keyword: $ => /[Cc][Oo][Mm][Pp][Ll][Ee][Tt][Ee][Cc][Oo][Ll][Ss]/,
    _completerows_keyword: $ => /[Cc][Oo][Mm][Pp][Ll][Ee][Tt][Ee][Rr][Oo][Ww][Ss]/,
    _named_keyword: $ => /[Nn][Aa][Mm][Ee][Dd]/,
    _noalias_keyword: $ => /[Nn][Oo][Aa][Ll][Ii][Aa][Ss]/,
    _nocenter_keyword: $ => /[Nn][Oo][Cc][Ee][Nn][Tt][Ee][Rr]/,
    _nocompletecols_keyword: $ => /[Nn][Oo][Cc][Oo][Mm][Pp][Ll][Ee][Tt][Ee][Cc][Oo][Ll][Ss]/,
    _nocompleterows_keyword: $ => /[Nn][Oo][Cc][Oo][Mm][Pp][Ll][Ee][Tt][Ee][Rr][Oo][Ww][Ss]/,
    _noexecute_keyword: $ => /[Nn][Oo][Ee][Xx][Ee][Cc][Uu][Tt][Ee]/,
    _noheader_keyword: $ => /[Nn][Oo][Hh][Ee][Aa][Dd][Ee][Rr]/,
    _outrept_keyword: $ => /[Oo][Uu][Tt][Rr][Ee][Pp][Tt]/,
    _report_keyword: $ => /[Rr][Ee][Pp][Oo][Rr][Tt]/,
    _showall_keyword: $ => /[Ss][Hh][Oo][Ww][Aa][Ll][Ll]/,
    _spanrows_keyword: $ => /[Ss][Pp][Aa][Nn][Rr][Oo][Ww][Ss]/,
    _noseps_keyword: $ => /[Nn][Oo][Ss][Ee][Pp][Ss]/,
    _trap_keyword: $ => /[Tt][Rr][Aa][Pp]/,
    // PROC SORT reuses the _sort_keyword token (defined further below, shared
    // with CIMPORT's sort= option) as its proc-name token — see the proc_sort_step
    // comment above for why no distinct _proc_sort_keyword is defined (Phase 3 C1).
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

    // --- Shared PROC option keywords (Phase 3 — appear across many PROCs) ---
    // Added so these highlight via proc_option_key regardless of which PROC
    // they appear on (Phase A baseline; per-proc rules in Phases B-D refine
    // which keys are valid for which proc, but highlighting is uniform).
    _in_keyword: $ => /[iI][nN]/,
    _library_keyword: $ => /[lL][iI][bB][rR][aA][rR][yY]/,
    _file_keyword: $ => /[fF][iI][lL][eE]/,
    _memtype_keyword: $ => /[mM][eE][mM][tT][yY][pP][eE]/,

    // --- PROC COPY option keywords (Phase 3 B1) ---
    // These are COPY-specific option keys/flags. _in_keyword/_out_keyword/
    // _memtype_keyword/_replace_keyword/_label_keyword above are reused by
    // copy_option_key/copy_option_flag. The rest are COPY-only.
    _accel_keyword: $ => /[aA][cC][cC][eE][lL]/,
    _noaccel_keyword: $ => /[nN][oO][aA][cC][cC][eE][lL]/,
    _clone_keyword: $ => /[cC][lL][oO][nN][eE]/,
    _noclone_keyword: $ => /[nN][oO][cC][lL][oO][nN][eE]/,
    _force_keyword: $ => /[fF][oO][rR][cC][eE]/,
    _move_keyword: $ => /[mM][oO][vV][eE]/,
    _datecopy_keyword: $ => /[dD][aA][tT][eE][cC][oO][pP][yY]/,
    _constraint_keyword: $ => /[cC][oO][nN][sS][tT][rR][aA][iI][nN][tT]/,
    _encryptkey_keyword: $ => /[eE][nN][cC][rR][yY][pP][tT][kK][eE][yY]/,
    _override_keyword: $ => /[oO][vV][eE][rR][rR][iI][dD][eE]/,
    _alter_keyword: $ => /[aA][lL][tT][eE][rR]/,
    _index_keyword: $ => /[iI][nN][dD][eE][xX]/,

    // --- PROC CPORT option keywords (Phase 3 B2) ---
    // CPORT-specific option keys/flags. _library_keyword/_file_keyword/
    // _memtype_keyword/_data_keyword/_index_keyword/_constraint_keyword above are
    // reused by cport_option_key; _datecopy_keyword (B1) is reused as a CPORT
    // flag too. The rest are CPORT-only.
    // Value-option keys (used by cport_option_key):
    _catalog_keyword: $ => /[cC][aA][tT][aA][lL][oO][gG]/,
    _after_keyword: $ => /[aA][fF][tT][eE][rR]/,
    _eet_keyword: $ => /[eE][eE][tT]/,
    _et_keyword: $ => /[eE][tT]/,
    _generation_keyword: $ => /[gG][eE][nN][eE][rR][aA][tT][iI][oO][nN]/,
    _intype_keyword: $ => /[iI][nN][tT][yY][pP][eE]/,
    _outlib_keyword: $ => /[oO][uU][tT][lL][iI][bB]/,
    _outtype_keyword: $ => /[oO][uU][tT][tT][yY][pP][eE]/,
    // Boolean flags (no '= value') used by cport_option_flag:
    _asis_keyword: $ => /[aA][sS][iI][sS]/,
    _nocompress_keyword: $ => /[nN][oO][cC][oO][mM][pP][rR][eE][sS][sS]/,
    _noedit_keyword: $ => /[nN][oO][eE][dD][iI][tT]/,
    _nosrc_keyword: $ => /[nN][oO][sS][rR][cC]/,
    _tape_keyword: $ => /[tT][aA][pP][eE]/,
    _translate_keyword: $ => /[tT][rR][aA][nN][sS][lL][aA][tT][eE]/,

    // --- PROC CIMPORT option keywords (Phase 3 B3) ---
    // CIMPORT-specific option keys/flags. _library_keyword/_file_keyword/
    // _data_keyword/_catalog_keyword/_memtype_keyword/_eet_keyword/_et_keyword
    // (CPORT/global) and _noedit_keyword/_nosrc_keyword/_tape_keyword (CPORT flags)
    // and _force_keyword (COPY) are reused by cimport_option_key/_flag. The rest
    // are CIMPORT-only. Single-letter aliases (c/d/l/n/y) are intentionally NOT
    // tokenized here — see the proc_cimport_step comment above (Phase 3 B3).
    // Value-option keys (used by cimport_option_key):
    _lib_keyword: $ => /[lL][iI][bB]/,
    _libref_keyword: $ => /[lL][iI][bB][rR][eE][fF]/,
    _cat_keyword: $ => /[cC][aA][tT]/,
    _ds_keyword: $ => /[dD][sS]/,
    _mt_keyword: $ => /[mM][tT]/,
    _compress_keyword: $ => /[cC][oO][mM][pP][rR][eE][sS][sS]/,
    _encodinginfo_keyword: $ => /[eE][nN][cC][oO][dD][iI][nN][gG][iI][nN][fF][oO]/,
    _extendformat_keyword: $ => /[eE][xX][tT][eE][nN][dD][fF][oO][rR][mM][aA][tT]/,
    _extendsn_keyword: $ => /[eE][xX][tT][eE][nN][dD][sS][nN]/,
    _extendvar_keyword: $ => /[eE][xX][tT][eE][nN][dD][vV][aA][rR]/,
    _infile_keyword: $ => /[iI][nN][fF][iI][lL][eE]/,
    _isfileutf8_keyword: $ => /[iI][sS][fF][iI][lL][eE][uU][tT][fF]8/,
    _new_keyword: $ => /[nN][eE][wW]/,
    _sort_keyword: $ => /[sS][oO][rR][tT]/,
    _upcase_keyword: $ => /[uU][pP][cC][aA][sS][eE]/,
    // nsrc: CIMPORT abbreviation of nosrc (a value-taking option here, unlike the
    // CPORT boolean nosrc flag). Kept distinct from _nosrc_keyword (longest-match
    // lexer prefers the 5-char nosrc over the 4-char nsrc when both could apply).
    _nsrc_keyword: $ => /[nN][sS][rR][cC]/,

    // --- PROC SORT option keywords (Phase 3 C1) ---
    // SORT-specific option keys/flags. _data_keyword/_out_keyword (global) and
    // _force_keyword/_datecopy_keyword (COPY/global) are reused by
    // sort_option_key/_flag. The rest are SORT-only.
    // Value-option keys (used by sort_option_key):
    _dupout_keyword: $ => /[dD][uU][pP][oO][uU][tT]/,
    _sortseq_keyword: $ => /[sS][oO][rR][tT][sS][eE][qQ]/,
    _sortsize_keyword: $ => /[sS][oO][rR][tT][sS][iI][zZ][eE]/,
    _uniqueout_keyword: $ => /[uU][nN][iI][qQ][uU][eE][oO][uU][tT]/,
    // Boolean flags (no '= value') used by sort_option_flag:
    _ascii_keyword: $ => /[aA][sS][cC][iI][iI]/,
    _danish_keyword: $ => /[dD][aA][nN][iI][sS][hH]/,
    _ebcdic_keyword: $ => /[eE][bB][cC][dD][iI][cC]/,
    _finnish_keyword: $ => /[fF][iI][nN][nN][iI][sS][hH]/,
    _national_keyword: $ => /[nN][aA][tT][iI][oO][nN][aA][lL]/,
    _norwegian_keyword: $ => /[nN][oO][rR][wW][eE][gG][iI][aA][nN]/,
    _swedish_keyword: $ => /[sS][wW][eE][dD][iI][sS][hH]/,
    _reverse_keyword: $ => /[rR][eE][vV][eE][rR][sS][eE]/,
    _equals_keyword: $ => /[eE][qQ][uU][aA][lL][sS]/,
    _noequals_keyword: $ => /[nN][oO][eE][qQ][uU][aA][lL][sS]/,
    _nodupkey_keyword: $ => /[nN][oO][dD][uU][pP][kK][eE][yY]/,
    _nouniquekey_keyword: $ => /[nN][oO][uU][nN][iI][qQ][uU][eE][kK][eE][yY]/,
    _nothreads_keyword: $ => /[nN][oO][tT][hH][rR][eE][aA][dD][sS]/,
    _threads_keyword: $ => /[tT][hH][rR][eE][aA][dD][sS]/,
    _tagsort_keyword: $ => /[tT][aA][gG][sS][oO][rR][tT]/,
    _presorted_keyword: $ => /[pP][rR][eE][sS][oO][rR][tT][eE][dD]/,
    _overwrite_keyword: $ => /[oO][vV][eE][rR][wW][rR][iI][tT][eE]/,

    // --- PROC DATASETS option keywords (Phase 3 C2 / Task 12) ---
    // DATASETS-specific option keys/flags. _library_keyword/_memtype_keyword/
    // _lib_keyword (global/CIMPORT)/_mt_keyword (CIMPORT)/_alter_keyword (COPY)/
    // _encryptkey_keyword (COPY)/_force_keyword (COPY) are reused by
    // datasets_option_key/_flag. The rest are DATASETS-only.
    // Value-option keys (used by datasets_option_key):
    _dd_keyword: $ => /[dD][dD]/,
    _ddname_keyword: $ => /[dD][dD][nN][aA][mM][eE]/,
    _mtype_keyword: $ => /[mM][tT][yY][pP][eE]/,
    _gennum_keyword: $ => /[gG][eE][nN][nN][uU][mM]/,
    _pw_keyword: $ => /[pP][wW]/,
    _read_keyword: $ => /[rR][eE][aA][dD]/,
    // Boolean flags (no '= value') used by datasets_option_flag:
    _kill_keyword: $ => /[kK][iI][lL][lL]/,
    _nolist_keyword: $ => /[nN][oO][lL][iI][sS][tT]/,
    _noprint_keyword: $ => /[nN][oO][pP][rR][iI][nN][tT]/,
    _nowarn_keyword: $ => /[nN][oO][wW][aA][rR][nN]/,
    _details_keyword: $ => /[dD][eE][tT][aA][iI][lL][sS]/,
    _nodetails_keyword: $ => /[nN][oO][dD][eE][tT][aA][iI][lL][sS]/,

    // --- PROC APPEND option keywords (Phase 3 C3 / Task 13) ---
    // APPEND-specific option keys/flags. _base_keyword/_data_keyword/_out_keyword
    // (global)/_force_keyword (COPY/global)/_encryptkey_keyword (COPY/global)/
    // _new_keyword (CIMPORT/global)/_nowarn_keyword (DATASETS/global) are reused by
    // append_option_key/_flag. The rest are APPEND-only.
    // Value-option key (used by append_option_key):
    _appendver_keyword: $ => /[aA][pP][pP][eE][nN][dD][vV][eE][rR]/,
    // Boolean flag (no '= value') used by append_option_flag:
    _getsort_keyword: $ => /[gG][eE][tT][sS][oO][rR][tT]/,

    // --- PROC STANDARD option keywords (Phase 3 C3 / Task 14) ---
    // STANDARD-specific option keys/flags. _data_keyword/_out_keyword (global)/
    // _noprint_keyword (DATASETS/global)/_replace_keyword (global) are reused by
    // standard_option_key/_flag. The rest are STANDARD-only.
    // Value-option keys (used by standard_option_key):
    _mean_keyword: $ => /[mM][eE][aA][nN]/,
    _std_keyword: $ => /[sS][tT][dD]/,
    _vardef_keyword: $ => /[vV][aA][rR][dD][eE][fF]/,
    _preserverawbyvalues_keyword: $ => /[pP][rR][eE][sS][eE][rR][vV][eE][rR][aA][wW][bB][yY][vV][aA][lL][uU][eE][sS]/,
    // Single-letter mean/std shorthand value-option keys. Char-class regexes of
    // length 1; tree-sitter longest-match resolves them ahead of the generic
    // identifier token at the option-key boundary. See standard_option_key.
    _m_keyword: $ => /[mM]/,
    _s_keyword: $ => /[sS]/,
    // Boolean flags (no '= value') used by standard_option_flag:
    _exclnpwgt_keyword: $ => /[eE][xX][cC][lL][nN][pP][wW][gG][tT]/,
    _exclnpwgts_keyword: $ => /[eE][xX][cC][lL][nN][pP][wW][gG][tT][sS]/,
    _print_keyword: $ => /[pP][rR][iI][nN][tT]/,

    // --- PROC PRINTTO option keywords (Phase 3 C3 / Task 15) ---
    // PRINTTO-specific option keys/flags. _file_keyword (shared/global)/
    // _new_keyword (CIMPORT/global)/_print_keyword (STANDARD/global)/
    // _label_keyword (COPY/global) are reused by printto_option_key/_flag.
    // The rest are PRINTTO-only. PRINTTO's options are all multi-letter, so no
    // single-letter-key concern here.
    // Value-option keys (used by printto_option_key):
    _log_keyword: $ => /[lL][oO][gG]/,
    _name_keyword: $ => /[nN][aA][mM][eE]/,
    _unit_keyword: $ => /[uU][nN][iI][tT]/,

    // --- PROC TRANSPOSE option keywords (Phase 3 C3 / Task 16) ---
    // TRANSPOSE-specific option keys/flags. _data_keyword/_out_keyword (global)/
    // _label_keyword (COPY/global)/_name_keyword (PRINTTO/global) are reused by
    // transpose_option_key. The rest are TRANSPOSE-only. TRANSPOSE's options are
    // all multi-letter, so no single-letter-key concern here.
    // Value-option keys (used by transpose_option_key):
    _delim_keyword: $ => /[dD][eE][lL][iI][mM]/,
    _delimiter_keyword: $ => /[dD][eE][lL][iI][mM][iI][tT][eE][rR]/,
    _prefix_keyword: $ => /[pP][rR][eE][fF][iI][xX]/,
    _suffix_keyword: $ => /[sS][uU][fF][fF][iI][xX]/,
    // Boolean flag (no '= value') used by transpose_option_flag:
    _let_keyword: $ => /[lL][eE][tT]/,

    // --- PROC CONTENTS option keywords (Phase 3 C3 / Task 17) ---
    // CONTENTS-specific option keys/flags. _data_keyword/_out_keyword (global)/
    // _memtype_keyword/_mt_keyword/_mtype_keyword (CIMPORT/global)/
    // _encryptkey_keyword (COPY/global)/_noprint_keyword/_details_keyword/
    // _nodetails_keyword (DATASETS/global) are reused by contents_option_key /
    // contents_option_flag. The rest are CONTENTS-only. CONTENTS's options are
    // all multi-letter, so no single-letter-key concern here.
    // Value-option keys (used by contents_option_key):
    _centiles_keyword: $ => /[cC][eE][nN][tT][iI][lL][eE][sS]/,
    _order_keyword: $ => /[oO][rR][dD][eE][rR]/,
    _out2_keyword: $ => /[oO][uU][tT]2/,
    _varnum_keyword: $ => /[vV][aA][rR][nN][uU][mM]/,
    // Boolean flags (no '= value') used by contents_option_flag:
    _directory_keyword: $ => /[dD][iI][rR][eE][cC][tT][oO][rR][yY]/,
    _nods_keyword: $ => /[nN][oO][dD][sS]/,
    _short_keyword: $ => /[sS][hH][oO][rR][tT]/,
    _fmtlen_keyword: $ => /[fF][mM][tT][lL][eE][nN]/,

    // --- PROC COMPARE option keywords (Phase 3 C3 / Task 18) ---
    // COMPARE-specific option keys/flags. _data_keyword/_out_keyword (global)/
    // _base_keyword/_compare_keyword (COPY/global)/_m_keyword (STANDARD/global)
    // are reused by compare_option_key. The rest are COMPARE-only.
    //
    // SINGLE-LETTER KEYWORDS b/c/m: the COMPARE spec lists b (base), c (compare),
    // and m (method) as single-letter value-option shorthand. Per the Phase C
    // template's single-letter guidance, m reuses the _m_keyword char-class token
    // already established by STANDARD (Task 14) — it routes cleanly via longest-
    // match and does not regress any corpus test. b and c, however, were found to
    // regress the error-recovery test 'data a set b;' (the single-letter token
    // consumes 'b' as a keyword instead of identifier, shifting the ERROR node
    // shape). Rather than re-capture that recovery test for a lexical side-effect,
    // b and c are NOT given dedicated keyword tokens: the $.identifier fallback in
    // compare_option_key catches them, so 'proc compare b=x c=y;' still produces
    // a compare_option_key node (just typed as identifier, not aliased 'b'/'c').
    // The linter's findAllOptionKeyNodes treats both shapes identically.
    // Value-option keys (used by compare_option_key):
    _comp_keyword: $ => /[cC][oO][mM][pP]/,
    _crit_keyword: $ => /[cC][rR][iI][tT]/,
    _criteria_keyword: $ => /[cC][rR][iI][tT][eE][rR][iI][aA]/,
    _criterion_keyword: $ => /[cC][rR][iI][tT][eE][rR][iI][oO][nN]/,
    _fuzz_keyword: $ => /[fF][uU][zZ][zZ]/,
    _maxprint_keyword: $ => /[mM][aA][xX][pP][rR][iI][nN][tT]/,
    _meth_keyword: $ => /[mM][eE][tT][hH]/,
    _method_keyword: $ => /[mM][eE][tT][hH][oO][dD]/,
    _outall_keyword: $ => /[oO][uU][tT][aA][lL][lL]/,
    _outbase_keyword: $ => /[oO][uU][tT][bB][aA][sS][eE]/,
    _outcomp_keyword: $ => /[oO][uU][tT][cC][oO][mM][pP]/,
    _outcompare_keyword: $ => /[oO][uU][tT][cC][oO][mM][pP][aA][rR][eE]/,
    _outdif_keyword: $ => /[oO][uU][tT][dD][iI][fF]/,
    _outdiff_keyword: $ => /[oO][uU][tT][dD][iI][fF][fF]/,
    _outnoeq_keyword: $ => /[oO][uU][tT][nN][oO][eE][qQ]/,
    _outnoequal_keyword: $ => /[oO][uU][tT][nN][oO][eE][qQ][uU][aA][lL]/,
    _outpercent_keyword: $ => /[oO][uU][tT][pP][eE][rR][cC][eE][nN][tT]/,
    _outstats_keyword: $ => /[oO][uU][tT][sS][tT][aA][tT][sS]/,
    // Boolean flags (no '= value') used by compare_option_flag:
    _all_keyword: $ => /[aA][lL][lL]/,
    _allobs_keyword: $ => /[aA][lL][lL][oO][bB][sS]/,
    _allstats_keyword: $ => /[aA][lL][lL][sS][tT][aA][tT][sS]/,
    _allvars_keyword: $ => /[aA][lL][lL][vV][aA][rR][sS]/,
    _brief_keyword: $ => /[bB][rR][iI][eE][fF]/,
    _briefsummary_keyword: $ => /[bB][rR][iI][eE][fF][sS][uU][mM][mM][aA][rR][yY]/,
    _error_keyword: $ => /[eE][rR][rR][oO][rR]/,
    _list_keyword: $ => /[lL][iI][sS][tT]/,
    _listall_keyword: $ => /[lL][iI][sS][tT][aA][lL][lL]/,
    _listbase_keyword: $ => /[lL][iI][sS][tT][bB][aA][sS][eE]/,
    _listbaseobs_keyword: $ => /[lL][iI][sS][tT][bB][aA][sS][eE][oO][bB][sS]/,
    _listbasevar_keyword: $ => /[lL][iI][sS][tT][bB][aA][sS][eE][vV][aA][rR]/,
    _listcomp_keyword: $ => /[lL][iI][sS][tT][cC][oO][mM][pP]/,
    _listcompare_keyword: $ => /[lL][iI][sS][tT][cC][oO][mM][pP][aA][rR][eE]/,
    _listcompareobs_keyword: $ => /[lL][iI][sS][tT][cC][oO][mM][pP][aA][rR][eE][oO][bB][sS]/,
    _listcomparevar_keyword: $ => /[lL][iI][sS][tT][cC][oO][mM][pP][aA][rR][eE][vV][aA][rR]/,
    _listcomparevars_keyword: $ => /[lL][iI][sS][tT][cC][oO][mM][pP][aA][rR][eE][vV][aA][rR][sS]/,
    _listcompobs_keyword: $ => /[lL][iI][sS][tT][cC][oO][mM][pP][oO][bB][sS]/,
    _listcompvar_keyword: $ => /[lL][iI][sS][tT][cC][oO][mM][pP][vV][aA][rR]/,
    _listeq_keyword: $ => /[lL][iI][sS][tT][eE][qQ]/,
    _listequal_keyword: $ => /[lL][iI][sS][tT][eE][qQ][uU][aA][lL]/,
    _listequalvar_keyword: $ => /[lL][iI][sS][tT][eE][qQ][uU][aA][lL][vV][aA][rR]/,
    _listeqvar_keyword: $ => /[lL][iI][sS][tT][eE][qQ][vV][aA][rR]/,
    _listobs_keyword: $ => /[lL][iI][sS][tT][oO][bB][sS]/,
    _listvar_keyword: $ => /[lL][iI][sS][tT][vV][aA][rR]/,
    _nodate_keyword: $ => /[nN][oO][dD][aA][tT][eE]/,
    _nomiss_keyword: $ => /[nN][oO][mM][iI][sS][sS]/,
    _nomiss1_keyword: $ => /[nN][oO][mM][iI][sS][sS]1/,
    _nomiss2_keyword: $ => /[nN][oO][mM][iI][sS][sS]2/,
    _nomissbase_keyword: $ => /[nN][oO][mM][iI][sS][sS][bB][aA][sS][eE]/,
    _nomisscomp_keyword: $ => /[nN][oO][mM][iI][sS][sS][cC][oO][mM][pP]/,
    _nomisscompare_keyword: $ => /[nN][oO][mM][iI][sS][sS][cC][oO][mM][pP][aA][rR][eE]/,
    _nomissing_keyword: $ => /[nN][oO][mM][iI][sS][sS][iI][nN][gG]/,
    _noobs_keyword: $ => /[nN][oO][oO][bB][sS]/,
    _nosum_keyword: $ => /[nN][oO][sS][uU][mM]/,
    _nosummary_keyword: $ => /[nN][oO][sS][uU][mM][mM][aA][rR][yY]/,
    _note_keyword: $ => /[nN][oO][tT][eE]/,
    _novalues_keyword: $ => /[nN][oO][vV][aA][lL][uU][eE][sS]/,
    _printall_keyword: $ => /[pP][rR][iI][nN][tT][aA][lL][lL]/,
    _statistics_keyword: $ => /[sS][tT][aA][tT][iI][sS][tT][iI][cC][sS]/,
    _stats_keyword: $ => /[sS][tT][aA][tT][sS]/,
    _trans_keyword: $ => /[tT][rR][aA][nN][sS]/,
    _warn_keyword: $ => /[wW][aA][rR][nN]/,
    _warning_keyword: $ => /[wW][aA][rR][nN][iI][nN][gG]/,

    // --- PROC FREQ option keywords (Phase 3 C3 / Task 22) ---
    // FREQ-specific option keys/flags. _data_keyword (global)/
    // _compress_keyword (SORT/global)/_noprint_keyword (DATASETS/global)/
    // _order_keyword (CONTENTS/global) are reused by freq_option_key /
    // freq_option_flag. The rest are FREQ-only. FREQ's options are all
    // multi-letter, so no single-letter-key concern here.
    // Value-option keys (used by freq_option_key):
    _formchar_keyword: $ => /[fF][oO][rR][mM][cC][hH][aA][rR]/,
    _nlevels_keyword: $ => /[nN][lL][eE][vV][eE][lL][sS]/,
    // Boolean flag (no '= value') used by freq_option_flag:
    _page_keyword: $ => /[pP][aA][gG][eE]/,

    // --- PROC OPTIONS option keywords (Phase 3 C3 / Task 19) ---
    // OPTIONS-specific option keys/flags. _short_keyword (PRINTTO/global) is
    // reused by options_option_flag. The rest are OPTIONS-only. All options are
    // multi-letter, so no single-letter-key concern here.
    // Value-option keys (used by options_option_key): define/group/hexvalue/
    // option/port/value commonly take '= value' (e.g. option=linesize,
    // group=MEMORY, define=value, port=XXXX, hexvalue=yes, value=...).
    _define_keyword: $ => /[dD][eE][fF][iI][nN][eE]/,
    _group_keyword: $ => /[gG][rR][oO][uU][pP]/,
    _hexvalue_keyword: $ => /[hH][eE][xX][vV][aA][lL][uU][eE]/,
    _option_keyword: $ => /[oO][pP][tT][iI][oO][nN]/,
    _port_keyword: $ => /[pP][oO][rR][tT]/,
    _value_keyword: $ => /[vV][aA][lL][uU][eE]/,
    // Boolean flags (no '= value') used by options_option_flag: expand/noexpand,
    // host/nohost, lognumberformat/nolognumberformat, long/short, listgroups,
    // listinsertappend, listoptsave, listrestrict, portable, restrict.
    _expand_keyword: $ => /[eE][xX][pP][aA][nN][dD]/,
    _noexpand_keyword: $ => /[nN][oO][eE][xX][pP][aA][nN][dD]/,
    _host_keyword: $ => /[hH][oO][sS][tT]/,
    _nohost_keyword: $ => /[nN][oO][hH][oO][sS][tT]/,
    _lognumberformat_keyword: $ => /[lL][oO][gG][nN][uU][mM][bB][eE][rR][fF][oO][rR][mM][aA][tT]/,
    _nolognumberformat_keyword: $ => /[nN][oO][lL][oO][gG][nN][uU][mM][bB][eE][rR][fF][oO][rR][mM][aA][tT]/,
    _long_keyword: $ => /[lL][oO][nN][gG]/,
    _listgroups_keyword: $ => /[lL][iI][sS][tT][gG][rR][oO][uU][pP][sS]/,
    _listinsertappend_keyword: $ => /[lL][iI][sS][tT][iI][nN][sS][eE][rR][tT][aA][pP][pP][eE][nN][dD]/,
    _listoptsave_keyword: $ => /[lL][iI][sS][tT][oO][pP][tT][sS][aA][vV][eE]/,
    _listrestrict_keyword: $ => /[lL][iI][sS][tT][rR][eE][sS][tT][rR][iI][cC][tT]/,
    _portable_keyword: $ => /[pP][oO][rR][tT][aA][bB][lL][eE]/,
    _restrict_keyword: $ => /[rR][eE][sS][tT][rR][iI][cC][tT]/,

    // --- PROC PRINT option keywords (Phase 3 C3 / Task 20) ---
    // PRINT-specific option keys/flags. _data_keyword/_label_keyword (global)/
    // _s_keyword (STANDARD/global)/_noobs_keyword (COMPARE/global) are reused by
    // print_option_key/print_option_flag. The rest are PRINT-only.
    //
    // SINGLE-LETTER KEYWORDS d/l/n/r: the PRINT spec lists d, l, n, r, s as
    // single-letter option shorthand (s reuses _s_keyword from STANDARD). Per
    // the Phase C template's single-letter guidance, d/l/n/r are given dedicated
    // _d_keyword/_l_keyword/_n_keyword/_r_keyword char-class tokens. tree-sitter's
    // longest-match rule makes them win over the generic identifier (length 1 vs
    // N) at the exact option-key boundary, and the $.identifier fallback in
    // print_option_key still catches unknown single-letter keys. See the
    // print_option_key comment for the empirical conflict check (Task 20): all
    // four route cleanly and do not regress any corpus test, so unlike
    // COMPARE's b/c (Task 18) no fallback-to-identifier is needed here.
    // Multi-letter value-option keys (used by print_option_key):
    _blank_keyword: $ => /[bB][lL][aA][nN][kK]/,
    _blankline_keyword: $ => /[bB][lL][aA][nN][kK][lL][iI][nN][eE]/,
    _contents_keyword: $ => /[cC][oO][nN][tT][eE][nN][tT][sS]/,
    _double_keyword: $ => /[dD][oO][uU][bB][lL][eE]/,
    // grand_label/grandtot_label/grandtotal_label/gtot_label/gtotal_label: the
    // underscore is a literal char in the regex char-class (no escape needed).
    _grand_label_keyword: $ => /[gG][rR][aA][nN][dD][_][lL][aA][bB][eE][lL]/,
    _grandtot_label_keyword: $ => /[gG][rR][aA][nN][dD][tT][oO][tT][_][lL][aA][bB][eE][lL]/,
    _grandtotal_label_keyword: $ => /[gG][rR][aA][nN][dD][tT][oO][tT][aA][lL][_][lL][aA][bB][eE][lL]/,
    _gtot_label_keyword: $ => /[gG][tT][oO][tT][_][lL][aA][bB][eE][lL]/,
    _gtotal_label_keyword: $ => /[gG][tT][oO][tT][aA][lL][_][lL][aA][bB][eE][lL]/,
    _heading_keyword: $ => /[hH][eE][aA][dD][iI][nN][gG]/,
    _nosumlabel_keyword: $ => /[nN][oO][sS][uU][mM][lL][aA][bB][eE][lL]/,
    _obs_keyword: $ => /[oO][bB][sS]/,
    _round_keyword: $ => /[rR][oO][uU][nN][dD]/,
    _rows_keyword: $ => /[rR][oO][wW][sS]/,
    _split_keyword: $ => /[sS][pP][lL][iI][tT]/,
    _style_keyword: $ => /[sS][tT][yY][lL][eE]/,
    _sumlabel_keyword: $ => /[sS][uU][mM][lL][aA][bB][eE][lL]/,
    _uniform_keyword: $ => /[uU][nN][iI][fF][oO][rR][mM]/,
    _width_keyword: $ => /[wW][iI][dD][tT][hH]/,
    // Single-letter value-option shorthand (d/l/n/r). See the block comment above
    // for the longest-match rationale and the empirical no-regression check.
    _d_keyword: $ => /[dD]/,
    _l_keyword: $ => /[lL]/,
    _n_keyword: $ => /[nN]/,
    _r_keyword: $ => /[rR]/,

    // --- PROC MEANS option keywords (Phase 3 C3 / Task 21) ---
    // MEANS-specific option keys/flags. Reused by means_option_key/_flag:
    // _data_keyword (global), _mean_keyword/_std_keyword/_vardef_keyword
    // (STANDARD/global), _exclnpwgt_keyword/_exclnpwgts_keyword/_print_keyword
    // (STANDARD/global), _noprint_keyword/_nothreads_keyword/_threads_keyword
    // (DATASETS/global), _order_keyword (CONTENTS/global), _range_keyword
    // (FREQ/global), _var_keyword (global), _printall_keyword (FREQ/global),
    // _n_keyword (PRINT/global). The rest are MEANS-only.
    //
    // SINGLE-LETTER KEYWORD t: the MEANS spec lists n and t as single-letter
    // statistic shorthand (n reuses _n_keyword from PRINT). Per the Phase C
    // template's single-letter guidance, t is given a dedicated _t_keyword
    // char-class token. tree-sitter's longest-match rule makes it win over the
    // generic identifier (length 1 vs N) at the exact option-key boundary, and
    // the $.identifier fallback in means_option_key still catches unknown
    // single-letter keys. See the means_option_key comment for the empirical
    // conflict check (Task 21): both n and t route cleanly and do not regress
    // any corpus test, so unlike COMPARE's b/c (Task 18) no fallback-to-
    // identifier is needed here.
    //
    // PERCENTILE KEYWORDS p1/p5/.../p99: these contain digits. The regex
    // char-class form works (e.g. _p1_keyword: /[pP]1/). tree-sitter's
    // longest-match resolves 'p10' as the 3-char _p10_keyword (never 'p1'+'0'),
    // 'p25' as 3-char _p25_keyword (never 'p2'+'5' — note there is no p2), and
    // 'p1' alone as 2-char _p1_keyword. The empirical check below (parse of
    // 'p10=x') confirms p10 wins over p1+0.
    //
    // Boolean flags (no '= value') used by means_option_flag:
    _chartype_keyword: $ => /[cC][hH][aA][rR][tT][yY][pP][eE]/,
    _completetypes_keyword: $ => /[cC][oO][mM][pP][lL][eE][tT][eE][tT][yY][pP][eE][sS]/,
    _descendtypes_keyword: $ => /[dD][eE][sS][cC][eE][nN][dD][tT][yY][pP][eE][sS]/,
    _exclusive_keyword: $ => /[eE][xX][cC][lL][uU][sS][iI][vV][eE]/,
    _idmin_keyword: $ => /[iI][dD][mM][iI][nN]/,
    _missing_keyword: $ => /[mM][iI][sS][sS][iI][nN][gG]/,
    _nolabel_keyword: $ => /[nN][oO][lL][aA][bB][eE][lL]/,
    _nonobs_keyword: $ => /[nN][oO][nN][oO][bB][sS]/,
    _notrap_keyword: $ => /[nN][oO][tT][rR][aA][pP]/,
    _nway_keyword: $ => /[nN][wW][aA][yY]/,
    _printalltypes_keyword: $ => /[pP][rR][iI][nN][tT][aA][lL][lL][tT][yY][pP][eE][sS]/,
    _printids_keyword: $ => /[pP][rR][iI][nN][tT][iI][dD][sS]/,
    _printidvars_keyword: $ => /[pP][rR][iI][nN][tT][iI][dD][vV][aA][rR][sS]/,
    _stackods_keyword: $ => /[sS][tT][aA][cC][kK][oO][dD][sS]/,
    _stackodsoutput_keyword: $ => /[sS][tT][aA][cC][kK][oO][dD][sS][oO][uU][tT][pP][uU][tT]/,
    // Value-option keys (used by means_option_key):
    _alpha_keyword: $ => /[aA][lL][pP][hH][aA]/,
    _classdata_keyword: $ => /[cC][lL][aA][sS][sS][dD][aA][tT][aA]/,
    _descend_keyword: $ => /[dD][eE][sS][cC][eE][nN][dD]/,
    _descending_keyword: $ => /[dD][eE][sS][cC][eE][nN][dD][iI][nN][gG]/,
    _fw_keyword: $ => /[fF][wW]/,
    _incas_keyword: $ => /[iI][nN][cC][aA][sS]/,
    _maxdec_keyword: $ => /[mM][aA][xX][dD][eE][cC]/,
    _pctldef_keyword: $ => /[pP][cC][tT][lL][dD][eE][fF]/,
    _qmarkers_keyword: $ => /[qQ][mM][aA][rR][kK][eE][rR][sS]/,
    _qmethod_keyword: $ => /[qQ][mM][eE][tT][hH][oO][dD]/,
    _qntldef_keyword: $ => /[qQ][nN][tT][lL][dD][eE][fF]/,
    _sumsize_keyword: $ => /[sS][uU][mM][sS][iI][zZ][eE]/,
    // Statistic keywords (used by means_option_key; bare flags or take args):
    _clm_keyword: $ => /[cC][lL][mM]/,
    _css_keyword: $ => /[cC][sS][sS]/,
    _kurt_keyword: $ => /[kK][uU][rR][tT]/,
    _kurtosis_keyword: $ => /[kK][uU][rR][tT][oO][sS][iI][sS]/,
    _lclm_keyword: $ => /[lL][cC][lL][mM]/,
    _max_keyword: $ => /[mM][aA][xX]/,
    _median_keyword: $ => /[mM][eE][dD][iI][aA][nN]/,
    _min_keyword: $ => /[mM][iI][nN]/,
    _mode_keyword: $ => /[mM][oO][dD][eE]/,
    _nmiss_keyword: $ => /[nN][mM][iI][sS][sS]/,
    _pbt_keyword: $ => /[pP][bB][tT]/,
    _probt_keyword: $ => /[pP][rR][oO][bB][tT]/,
    _q1_keyword: $ => /[qQ]1/,
    _q3_keyword: $ => /[qQ]3/,
    _qrange_keyword: $ => /[qQ][rR][aA][nN][gG][eE]/,
    _skew_keyword: $ => /[sS][kK][eE][wW]/,
    _skewness_keyword: $ => /[sS][kK][eE][wW][nN][eE][sS][sS]/,
    _stddev_keyword: $ => /[sS][tT][dD][dD][eE][vV]/,
    _stderr_keyword: $ => /[sS][tT][dD][eE][rR][rR]/,
    _sum_keyword: $ => /[sS][uU][mM]/,
    _sumwgt_keyword: $ => /[sS][uU][mM][wW][gG][tT]/,
    _uclm_keyword: $ => /[uU][cC][lL][mM]/,
    _uss_keyword: $ => /[uU][sS][sS]/,
    // Percentile statistic keywords (p1/p5/p10/p20/p25/p30/p40/p50/p60/p70/p75/
    // p80/p90/p95/p99). The digit is a literal char in the regex char-class.
    // Longest-match resolves 'p10' over 'p1' (3 vs 2 chars) — see block comment.
    _p1_keyword: $ => /[pP]1/,
    _p5_keyword: $ => /[pP]5/,
    _p10_keyword: $ => /[pP]10/,
    _p20_keyword: $ => /[pP]20/,
    _p25_keyword: $ => /[pP]25/,
    _p30_keyword: $ => /[pP]30/,
    _p40_keyword: $ => /[pP]40/,
    _p50_keyword: $ => /[pP]50/,
    _p60_keyword: $ => /[pP]60/,
    _p70_keyword: $ => /[pP]70/,
    _p75_keyword: $ => /[pP]75/,
    _p80_keyword: $ => /[pP]80/,
    _p90_keyword: $ => /[pP]90/,
    _p95_keyword: $ => /[pP]95/,
    _p99_keyword: $ => /[pP]99/,
    // Single-letter statistic shorthand (t). See the block comment above for the
    // longest-match rationale and the empirical no-regression check. (n reuses
    // _n_keyword defined in the PRINT block above.)
    _t_keyword: $ => /[tT]/,

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
