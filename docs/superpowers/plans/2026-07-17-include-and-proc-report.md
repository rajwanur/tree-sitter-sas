# `%include` Fix + PROC REPORT Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `%include "path";` parse error and complete PROC REPORT keyword coverage (define usages + LINE in compute blocks) in the tree-sitter SAS grammar.

**Architecture:** All work is in the standalone grammar repo `D:/Work/tree-sitter-sas/`. Changes are pure grammar-rule additions/modifications in `grammar.js`, validated by tree-sitter corpus tests, then compiled to WASM and copied into `D:/Work/MIC/lsp-server/grammars/tree-sitter-sas.wasm`. The `grammar.js` uses JS-format tree-sitter rules; the corpus uses the standard `=== title ===` / code / `---` / S-expression format.

**Tech Stack:** tree-sitter CLI 0.26.x (`npx tree-sitter generate|test|build --wasm`), Node.js 24, JS grammar DSL.

## Global Constraints

- **Working repo:** `D:/Work/tree-sitter-sas` (NOT `D:/Work/MIC/tree-sitter-sas` which is a stale copy).
- **Grammar file:** `grammar.js` (2037 lines). All keyword regexes are case-insensitive via explicit `[xX][yY]...` alternation — match this style for any new token.
- **Corpus test format:** `=== Test Name ===` header, blank line, SAS code (ends with blank line + `---`), then expected S-expression parse tree. See `test/corpus/proc_other.txt:1-26` for a reference.
- **Acceptance gate:** `npx tree-sitter test` must show **zero failures** after every task. No new ERROR/MISSING nodes on reproduction cases.
- **No `grammar.json` / `parser.c` / `node-types.json` edits by hand** — `tree-sitter generate` regenerates them.
- **Commit each task** in the `tree-sitter-sas` repo with conventional-commit prefixes (`fix(grammar):`, `feat(grammar):`).
- **Do NOT** modify `D:/Work/MIC/extension.toml` grammar-pin until Task 4 verification passes.

---

## File Structure

- **Modify:** `D:/Work/tree-sitter-sas/grammar.js`
  - Add `include_statement` rule (near `filename_statement`, ~line 1818-1830 region) and wire into `global_statement` (line 1790).
  - Add `_report_usage_keyword` token (near `_include_keyword`, ~line 1955).
  - Modify `report_define_statement` (line 1455-1462) to accept the usage keyword.
  - Add `report_line_statement` rule (near `report_order_statement`, line 1466) and wire into `proc_body` (after line 413).
- **Create:** `D:/Work/tree-sitter-sas/test/corpus/proc_report.txt` — comprehensive PROC REPORT corpus.
- **Modify:** `D:/Work/tree-sitter-sas/test/corpus/macro_language.txt` — add `%include` cases.
- **Regenerate (automatic):** `src/grammar.json`, `src/node-types.json`, `src/parser.c`, `tree-sitter-sas.wasm`.

---

## Task 1: Fix `%include` statement

**Files:**
- Modify: `D:/Work/tree-sitter-sas/grammar.js` — add `include_statement` rule; wire into `global_statement` (line 1790).
- Test: `D:/Work/tree-sitter-sas/test/corpus/macro_language.txt` — append `%include` cases.

**Interfaces:**
- Consumes: existing `$.quoted_string`, `$.identifier`, `$.macro_variable_reference`, `_include_keyword` token (line 1955).
- Produces: `include_statement` node type (consumed by `global_statement`).

- [ ] **Step 1: Write the failing corpus tests**

Append to `D:/Work/tree-sitter-sas/test/corpus/macro_language.txt`. Use this exact content (note the `%inc` abbreviation case is included but will only pass if Step 3's regex supports it; if it fails, remove that case and document `%inc` as a follow-up):

```

================================================================================
%INCLUDE statements (global)
================================================================================
%let progname = study53/f-ada-eff.sas;
%include "&progname";
%include "/abs/path/file.sas" /source2;
%include fileref;
--------------------------------------------------------------------------------

(source_file
  (macro_let_statement
    name: (identifier)
    value: (macro_text
      (macro_text_token)))
  (include_statement
    (quoted_string
      (double_quoted_string)))
  (include_statement
    (quoted_string
      (double_quoted_string))
    (identifier))
  (include_statement
    (identifier)))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/Work/tree-sitter-sas && npx tree-sitter test`
Expected: FAIL on the new `%INCLUDE statements` test — the `%include` lines parse as `macro_call_statement` with ERROR nodes, not as `include_statement`.

- [ ] **Step 3: Add the `include_statement` rule**

In `D:/Work/tree-sitter-sas/grammar.js`, locate `filename_statement` (ends ~line 1830 with `;'\n)`). Immediately after it, add:

```js
    // %INCLUDE -- include an external SAS file. Forms:
    //   %include "path/file.sas";
    //   %include "&macrovar/file.sas" /source2;
    //   %include fileref;
    // Reuses the existing _include_keyword token (previously orphaned).
    // The token regex matches both %include and the %inc abbreviation.
    include_statement: $ => seq(
      alias($._include_keyword, '%include'),
      repeat1(choice($.quoted_string, $.identifier, $.macro_variable_reference)),
      optional(seq('/', repeat1($.identifier))),  // options: /source2 /nosource2 ...
      ';'
    ),
```

Then update the `_include_keyword` token at line 1955 to also match the `%inc` abbreviation. Replace:
```js
    _include_keyword: $ => /%[iI][nN][cC][lL][uU][dD][eE]/,
```
with:
```js
    // Matches %include and the %inc abbreviation (case-insensitive).
    _include_keyword: $ => /%[iI][nN][cC]([lL][uU][dD][eE])?/,
```

- [ ] **Step 4: Wire `include_statement` into `global_statement`**

At line 1790, `global_statement` is a `choice(...)`. Add `$.include_statement` as a new alternative. Change:
```js
    global_statement: $ => choice(
      $.libname_statement,
      $.filename_statement,
      $.options_statement,
      $.title_statement,
      $.footnote_statement,
      $.ods_statement,
      $.x_statement,
    ),
```
to:
```js
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
```

- [ ] **Step 5: Regenerate and run tests**

Run:
```bash
cd D:/Work/tree-sitter-sas
npx tree-sitter generate
npx tree-sitter test
```
Expected: `generate` succeeds with no error. `test` shows the new `%INCLUDE statements` test PASSING, and all pre-existing tests still pass (zero failures).

**If `generate` reports a conflict:** the most likely cause is `%include` token precedence vs the generic `%` macro-call tokenizer. Fix by wrapping the token in `token(prec(1, /%[iI][nN][cC]([lL][uU][dD][eE])?/))`. Re-run `generate`.

- [ ] **Step 6: Commit**

```bash
cd D:/Work/tree-sitter-sas
git add grammar.js test/corpus/macro_language.txt src/
git commit -m "fix(grammar): %include statement parses quoted paths and filerefs

The _include_keyword token was orphaned (defined but referenced by no
rule), so %include fell through to macro_call_statement which rejected
the quoted-path argument -- producing 'Syntax error: unexpected
construct' on %include \"&macrovar/file.sas\".

Add a dedicated include_statement (modeled on libname_statement) wired
into global_statement. Also extend _include_keyword to match the %inc
abbreviation."
```

---

## Task 2: PROC REPORT `define` usage keywords

**Files:**
- Modify: `D:/Work/tree-sitter-sas/grammar.js` — add `_report_usage_keyword` token; use it in `report_define_statement`.
- Test: `D:/Work/tree-sitter-sas/test/corpus/proc_report.txt` — create new file with define-usage cases.

**Interfaces:**
- Consumes: existing `report_define_statement` (line 1455).
- Produces: `_report_usage_keyword` token used inside `report_define_statement` nodes.

- [ ] **Step 1: Create the failing corpus file**

Create `D:/Work/tree-sitter-sas/test/corpus/proc_report.txt` with this content. (The expected trees show `(report_usage_keyword)` nodes — these will not exist until Step 3, so the test must fail first.)

```
================================================================================
PROC REPORT define usage keywords
================================================================================
proc report data=mydata;
  column name age;
  define name / display;
  define age / analysis sum;
  define region / group order;
  define col1 / across;
  define computed_col / computed;
run;
--------------------------------------------------------------------------------

(source_file
  (proc_step
    name: (proc_name
      (identifier))
    options: (proc_options
      (proc_option
        (proc_option_key)
        (identifier)))
    body: (proc_body
      (report_column_statement
        (identifier)
        (identifier))
      (report_define_statement
        (identifier)
        (report_usage_keyword))
      (report_define_statement
        (identifier)
        (report_usage_keyword)
        (identifier))
      (report_define_statement
        (identifier)
        (report_usage_keyword)
        (report_usage_keyword))
      (report_define_statement
        (identifier)
        (report_usage_keyword))
      (report_define_statement
        (identifier)
        (report_usage_keyword)))))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/Work/tree-sitter-sas && npx tree-sitter test`
Expected: FAIL on "PROC REPORT define usage keywords" — the usage words parse as bare `(identifier)` nodes, not `(report_usage_keyword)`.

- [ ] **Step 3: Add the `_report_usage_keyword` token and alias it**

In `D:/Work/tree-sitter-sas/grammar.js`, near the existing PROC REPORT rules (~line 1466, after `report_order_statement`), add:

```js
    // Token: PROC REPORT DEFINE usage keywords (case-insensitive).
    // Aliased to 'report_usage_keyword' when used so they highlight distinctly
    // from generic identifiers.
    _report_usage_keyword: $ => /[dD][iI][sS][pP][lL][aA][yY]|[gG][rR][oO][uU][pP]|[aA][nN][aA][lL][yY][sS][iI][sS]|[aA][cC][rR][oO][sS][sS]|[oO][rR][dD][eE][rR]|[cC][oO][mM][pP][uU][tT][eE][dD]/,
```

- [ ] **Step 4: Use the keyword inside `report_define_statement`**

At line 1455-1462, `report_define_statement` currently has `$.identifier` as the first slash-option alternative. Add the keyword as a higher-priority alternative by aliasing the token. Replace the rule:
```js
    report_define_statement: $ => seq('define', choice($.identifier, $.macro_variable_reference), '/', repeat1(choice(
      $.identifier,
      $.quoted_string,
      $.number,
      '=',
      seq('(', repeat(choice($.identifier, $.number, '=', ',')), ')'),
      seq('[', repeat(choice($.identifier, $.number, '=', ',')), ']'),
    )), ';'),
```
with:
```js
    report_define_statement: $ => seq('define', choice($.identifier, $.macro_variable_reference), '/', repeat1(choice(
      alias($._report_usage_keyword, $.report_usage_keyword),
      $.identifier,
      $.quoted_string,
      $.number,
      '=',
      seq('(', repeat(choice($.identifier, $.number, '=', ',')), ')'),
      seq('[', repeat(choice($.identifier, $.number, '=', ',')), ']'),
    )), ';'),
```

The `alias($._report_usage_keyword, $.report_usage_keyword)` form produces a named `report_usage_keyword` node type (matching the test's expected tree), and as a keyword token it wins over `identifier` via tree-sitter longest-match.

- [ ] **Step 5: Regenerate and run tests**

Run:
```bash
cd D:/Work/tree-sitter-sas
npx tree-sitter generate
npx tree-sitter test
```
Expected: `generate` succeeds. The new "PROC REPORT define usage keywords" test PASSES. The existing "PROC REPORT with COLUMN and DEFINE" test in `proc_other.txt:28-51` still passes (its `define name / display;` will now produce `(report_usage_keyword)` instead of `(identifier)` — **this may break that pre-existing test**; if so, update `proc_other.txt:51` to expect `(report_usage_keyword)` in place of that `(identifier)`).

**If the `proc_other.txt` test breaks:** that is expected and correct — update its expected tree. Change line 51 from `(identifier)))))` to `(report_usage_keyword)))))`.

- [ ] **Step 6: Commit**

```bash
cd D:/Work/tree-sitter-sas
git add grammar.js test/corpus/proc_report.txt test/corpus/proc_other.txt src/
git commit -m "feat(grammar): PROC REPORT define usage keywords tokenize distinctly

display/group/analysis/across/order/computed were only matching as
generic identifiers inside DEFINE slash-options, so they didn't
highlight as keywords and added parsing ambiguity. Add a
_report_usage_keyword token (case-insensitive) and alias it to a
named report_usage_keyword node type used in report_define_statement."
```

---

## Task 3: PROC REPORT `line` statement in compute blocks

**Files:**
- Modify: `D:/Work/tree-sitter-sas/grammar.js` — add `report_line_statement`; wire into `proc_body`.
- Test: `D:/Work/tree-sitter-sas/test/corpus/proc_report.txt` — append LINE/compute/break cases.

**Interfaces:**
- Consumes: existing `$.statement` (so it's reachable inside `report_compute_statement`'s `repeat($.statement)` body) and `proc_body`.
- Produces: `report_line_statement` node type.

- [ ] **Step 1: Write the failing corpus cases**

Append to `D:/Work/tree-sitter-sas/test/corpus/proc_report.txt`:

```

================================================================================
PROC REPORT compute block with LINE statement
================================================================================
proc report data=mydata;
  column name age;
  define age / analysis;
  compute age;
    line @5 "Total: " age.dollar8.;
    if age > 14 then call define(_row_, 'style', 'style=[background=yellow]');
  endcomp;
run;
--------------------------------------------------------------------------------

(source_file
  (proc_step
    name: (proc_name
      (identifier))
    options: (proc_options
      (proc_option
        (proc_option_key)
        (identifier)))
    body: (proc_body
      (report_column_statement
        (identifier)
        (identifier))
      (report_define_statement
        (identifier)
        (report_usage_keyword))
      (report_compute_statement
        (identifier)
        (report_line_statement
          (number)
          (quoted_string
            (double_quoted_string))
          (identifier))
        (if_statement
          condition: (binary_expression
            left: (identifier)
            right: (number))
          consequence: (call_statement
            (identifier)
            (identifier)
            (quoted_string
              (single_quoted_string))
            (quoted_string
              (single_quoted_string))))))))
```

Note: the `@5` pointer and `.dollar8.` format will parse loosely (the `@5` as `(number)` since `@` is not specifically handled; `age.dollar8.` as `(identifier)` via the dot-name fallback). The test asserts this loose parse — it documents the current scope. If the actual parse differs, adjust the expected tree to match reality (the point of this test is that there is NO ERROR node, not the exact tree shape).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/Work/tree-sitter-sas && npx tree-sitter test`
Expected: FAIL — the `line @5 "Total: " ...;` line inside the compute block produces an ERROR node because no rule recognizes `line` at statement position with these arguments.

- [ ] **Step 3: Add `report_line_statement` rule**

In `D:/Work/tree-sitter-sas/grammar.js`, after `report_order_statement` (line 1466) and the new `_report_usage_keyword` from Task 2, add:

```js
    // LINE -- output statement, valid inside COMPUTE blocks.
    //   line @5 name $20.;
    //   line "Total: " sumvar;
    // NOTE: pointer (@N) and format ($20., dollar8.) syntax parse loosely
    // (as number/identifier) in this initial coverage. Tightening is a
    // documented follow-up if real files need stricter handling.
    report_line_statement: $ => seq(
      'line',
      repeat1(choice($.quoted_string, $.identifier, $.number, $.macro_variable_reference)),
      ';'
    ),
```

- [ ] **Step 4: Wire into `proc_body`**

At line 413, inside `proc_body`'s `choice(...)`, the REPORT block is:
```js
      // PROC REPORT statements
      $.report_column_statement,
      $.report_define_statement,
      $.report_compute_statement,
      $.report_break_statement,
      $.report_rbreak_statement,
      $.report_order_statement,
```
Add `$.report_line_statement` to the end of this block:
```js
      // PROC REPORT statements
      $.report_column_statement,
      $.report_define_statement,
      $.report_compute_statement,
      $.report_break_statement,
      $.report_rbreak_statement,
      $.report_order_statement,
      $.report_line_statement,
```

- [ ] **Step 5: Regenerate and run tests**

Run:
```bash
cd D:/Work/tree-sitter-sas
npx tree-sitter generate
npx tree-sitter test
```
Expected: `generate` succeeds. The "PROC REPORT compute block with LINE statement" test PASSES. If the expected tree doesn't match the actual loose parse (e.g. `@5` tokenizes differently), **adjust the expected tree in the corpus to match the actual parse** — the acceptance criterion is "no ERROR node on the `line` statement", re-verified in Step 6.

**If `generate` reports a conflict on `line`:** SAS also has `line` as a fileref-style statement elsewhere. The conflict is unlikely because `report_line_statement` is only in `proc_body`, but if it occurs, wrap the rule in `prec(1, seq(...))`.

- [ ] **Step 6: Verify no ERROR nodes on real-world reproduction**

Run:
```bash
cd D:/Work/tree-sitter-sas
printf '%%include "&x";\n' > /tmp/verify_inc.sas
cat > /tmp/verify_report.sas <<'EOF'
proc report data=sashelp.class;
  column name age;
  define age / analysis sum;
  compute age;
    line @5 "Total: " age;
  endcomp;
  break after name / summarize;
run;
EOF
npx tree-sitter parse /tmp/verify_inc.sas
npx tree-sitter parse /tmp/verify_report.sas
```
Expected: Both parses contain **zero** `(ERROR ...)` or `(MISSING ...)` nodes. `%include` parses as `(include_statement ...)`; the compute block parses cleanly with `(report_line_statement ...)`.

- [ ] **Step 7: Commit**

```bash
cd D:/Work/tree-sitter-sas
git add grammar.js test/corpus/proc_report.txt src/
git commit -m "feat(grammar): PROC REPORT LINE statement in compute blocks

Add report_line_statement for the LINE output statement used inside
COMPUTE blocks. Parses quoted strings, identifiers, numbers, and macro
variable references. Pointer (@N) and format syntax parse loosely in
this initial coverage -- documented as a follow-up. Wired into
proc_body so it's reachable inside compute blocks via \$.statement."
```

---

## Task 4: Rebuild WASM and roll out to MIC

**Files:**
- Build: `D:/Work/tree-sitter-sas/tree-sitter-sas.wasm`
- Copy to: `D:/Work/MIC/lsp-server/grammars/tree-sitter-sas.wasm`

**Interfaces:**
- Consumes: the verified grammar from Tasks 1-3.
- Produces: an updated grammar WASM that the LSP server (and, after Zed reload, the editor) loads.

- [ ] **Step 1: Rebuild the WASM**

Run:
```bash
cd D:/Work/tree-sitter-sas
npx tree-sitter build --wasm
```
Expected: produces `tree-sitter-sas.wasm` with no error. (This invokes the bundled Emscripten/Docker toolchain; it may take 1-3 minutes.)

- [ ] **Step 2: Copy the WASM into MIC**

Run:
```bash
cp D:/Work/tree-sitter-sas/tree-sitter-sas.wasm D:/Work/MIC/lsp-server/grammars/tree-sitter-sas.wasm
ls -la D:/Work/MIC/lsp-server/grammars/tree-sitter-sas.wasm
```
Expected: file copied, timestamp is now, size > 4MB.

- [ ] **Step 3: Smoke-test the LSP server loads the new grammar**

Run:
```bash
cd D:/Work/MIC/lsp-server
PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":1,"rootUri":"file:///D:/Work/MIC","capabilities":{"general":{"positionEncodings":["utf-16"]}}}}'
LEN=$(printf '%s' "$PAYLOAD" | wc -c)
{ printf 'Content-Length: %s\r\n\r\n' "$LEN"; printf '%s' "$PAYLOAD"; sleep 2; } | timeout 8 node dist/server.js --stdio 2>&1 | head -20
```
Expected: stdout contains `SAS LSP server initialized (encoding: utf-16, grammar loaded)` and an `initialize` result with capabilities. No `require` errors, no grammar-load errors.

- [ ] **Step 4: Verify the %include reproduction now parses clean via the LSP's parser**

Run:
```bash
cd D:/Work/MIC/lsp-server
cat > /tmp/lsp_inc_test.sas <<'EOF'
%let progname = study53/f-ada-eff.sas;
%include "&progname";
EOF
# Parse via the grammar directly (independent of LSP plumbing)
npx --prefix D:/Work/tree-sitter-sas tree-sitter parse /tmp/lsp_inc_test.sas
```
Expected: parse tree shows `(include_statement ...)` with zero ERROR nodes. (Direct grammar parse is the source of truth; the LSP uses the same WASM.)

- [ ] **Step 5: Run the LSP test suite (regression check)**

Run:
```bash
cd D:/Work/MIC/lsp-server
npm test
```
Expected: All tests pass (baseline: 144 passed, 6 skipped). No regressions from the grammar change.

- [ ] **Step 6: Commit the WASM in the MIC repo and report**

The MIC repo tracks `lsp-server/grammars/tree-sitter-sas.wasm` (it is NOT gitignored — only `dist/` and `node_modules/` are). Commit the updated binary:
```bash
cd D:/Work/MIC
git add lsp-server/grammars/tree-sitter-sas.wasm
git status --short lsp-server/grammars/tree-sitter-sas.wasm
git commit -m "chore(grammar): rebuild WASM with %include fix + PROC REPORT coverage

Rebuild from tree-sitter-sas HEAD <fill-in-commit-hash>:
- %include statement parses quoted paths and filerefs (was a syntax error)
- PROC REPORT define usage keywords tokenize as report_usage_keyword
- PROC REPORT LINE statement supported inside compute blocks

See D:/Work/tree-sitter-sas/docs/superpowers/specs/2026-07-17-include-and-proc-report-design.md"
```
Replace `<fill-in-commit-hash>` with the actual HEAD hash from `git -C D:/Work/tree-sitter-sas rev-parse --short HEAD` after Task 3's commit.

- [ ] **Step 7: Report to user with reload instructions**

Tell the user: reload Zed (`dev: reload extensions` or full restart). The `%include` red squiggle should be gone and PROC REPORT keywords should highlight. Confirm the deferral: the MIC `extension.toml` grammar-pin was NOT bumped (the dev extension uses the junction'd source WASM directly, so no pin change is needed for the user's machine; pinning matters only for publishing).

---

## Verification Summary (run after all tasks)

The complete verification, with evidence:
1. `npx tree-sitter test` in the grammar repo → all corpus tests pass.
2. `npx tree-sitter parse` on `/tmp/verify_inc.sas` and `/tmp/verify_report.sas` → zero ERROR/MISSING nodes.
3. LSP server smoke test → initializes, loads grammar, returns capabilities.
4. `npm test` in MIC/lsp-server → no regressions (144+ passed).
5. WASM copied and committed to MIC repo.
