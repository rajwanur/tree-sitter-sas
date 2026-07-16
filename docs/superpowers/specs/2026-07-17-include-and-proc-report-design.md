# Design: `%include` fix + full PROC REPORT keyword coverage

**Date:** 2026-07-17
**Repo:** `D:/Work/tree-sitter-sas` (the canonical grammar; WASM is copied into `D:/Work/MIC/lsp-server/grammars/`)
**Scope:** Two grammar changes, one bug-fix and one feature-completion.

---

## Background / problem

Two issues surfaced when the user opened a real clinical-trials SAS file:

1. **`%include` produces a parse error.** `%include "&progname";` is highlighted red with `Syntax error: unexpected construct`. Root cause confirmed by reproduction:
   - The grammar defines `_include_keyword` at `grammar.js:1955` but **no rule references it** — it is orphaned.
   - As a result, `%include` falls through to `macro_call_statement` (`grammar.js:591`), which after the `%name` accepts only `(...)` or a bare `;`.
   - The quoted-path argument matches neither branch → ERROR node on the string. This is the exact squiggle the user sees.

2. **PROC REPORT coverage is partial.** Six statement rules exist (`report_column/define/compute/break/rbreak/order_statement`), but the `define` usage keywords (`display`/`group`/`analysis`/`across`/`order`/`computed`) only match as generic identifiers, so they don't highlight or parse as keywords, and `line` statements inside compute blocks aren't recognized.

---

## Part A — Fix `%include`

### Approach

Add a dedicated `include_statement` rule modeled on the existing `libname_statement` / `filename_statement` pattern (`grammar.js:1804`, `grammar.js:1818`), and wire it into `global_statement` (`grammar.js:1790`).

The existing `_include_keyword` token (`grammar.js:1955`) already matches `%include` and the `%inc` prefix-cased form, so it is reused rather than redefined. (SAS accepts `%inc` as an abbreviation; the regex `/%[iI][nN][cC][lL][uU][dD][eE]/` also matches the shorter `%inc` via longest-prefix-of-token behavior — **to be verified during implementation**; if `%inc` needs explicit support, the regex becomes `/%[iI][nN][cC]([lL][uU][dD][eE])?/`.)

### SAS forms to support

```sas
%include "path/file.sas";                    %* quoted path ;
%include "&macrovar/file.sas";               %* macro-interpolated path (the screenshot case) ;
%include "/abs/path/file.sas" /source2;      %* path + options ;
%include fileref;                            %* bare fileref (identifier) ;
%include "a.sas" "b.sas";                    %* multiple paths ;
```

### Rule

```js
// %INCLUDE -- include an external SAS file. Forms:
//   %include "path/file.sas";
//   %include "&macrovar/file.sas" /source2;
//   %include fileref;
// Reuses the existing _include_keyword token (previously orphaned).
include_statement: $ => seq(
  alias($._include_keyword, '%include'),
  repeat1(choice($.quoted_string, $.identifier, $.macro_variable_reference)),
  optional(seq('/', repeat1($.identifier))),  // options: /source2 /nosource2 ...
  ';'
),
```

Add `$.include_statement` to `global_statement`'s `choice(...)` (`grammar.js:1790`).

### Why not extend `macro_call_statement`

Tempting (it's where `%include` lands today), but wrong: `macro_call_statement` is a bounded generic form shared by all user macro calls. Special-casing `%include` inside it would complicate that rule and risk GLR conflicts. A dedicated rule is cleaner, matches the existing `libname`/`filename` pattern, and produces a distinct `include_statement` node type (useful for the LSP server later).

---

## Part B — Full PROC REPORT keyword coverage

### Approach

Three changes, all localized to the existing PROC REPORT statement block (`grammar.js:1441-1466`):

#### B.1 — Recognize `define` usage keywords

Add a keyword token and use it inside `report_define_statement`:

```js
_report_usage_keyword: $ => /[dD][iI][sS][pP][lL][aA][yY]|[gG][rR][oO][uU][pP]|[aA][nN][aA][lL][yY][sS][iI][sS]|[aA][cC][rR][oO][sS][sS]|[oO][rR][dD][eE][rR]|[cC][oO][mM][pP][uU][tT][eE][dD]/,
```

This tokenizes `display`/`group`/`analysis`/`across`/`order`/`computed` as keywords so they highlight correctly and parse deterministically. The existing `report_define_statement` slash-options already accept `$.identifier`, so the keyword token becomes an additional `choice` alternative (it will win over `identifier` via longest-match / explicit precedence if needed).

**Note on `order`:** `order` is already a top-level PROC REPORT statement (`report_order_statement`, `grammar.js:1466`). Having it also appear as a define-usage keyword is fine — context disambiguates (after `/` it's a usage; at statement start it's `report_order_statement`). Will verify no conflict during `tree-sitter generate`.

#### B.2 — LINE statement (inside compute blocks)

```js
// LINE -- output statement, valid only inside COMPUTE blocks.
//   line @5 name $20.;
//   line "Total: " sumvar dollar8.;
report_line_statement: $ => seq(
  'line',
  repeat1(choice($.quoted_string, $.identifier, $.number, $.macro_variable_reference)),
  ';'
),
```

Wire `$.report_line_statement` into `proc_body`'s `choice(...)`. Because compute blocks use `repeat($.statement)`, and `statement` includes proc-body statements, the `line` statement will be reachable inside compute blocks.

**Note:** SAS `line` uses `@` column pointers and formats (`$20.`, `dollar8.`). The initial rule accepts identifiers/numbers/strings which covers the common cases; pointer/format syntax can be tightened later if real files need it.

#### B.3 — CALL DEFINE: no change needed

Verified by direct parse: `call define(_row_, 'style', 'style=[background=yellow]');` already parses cleanly inside a compute block as a `call_statement` (recognized as a routine call). **No new rule required.** Documented here to record the decision.

### Why keyword tokens instead of leaving them as identifiers

Two reasons: (1) consistent syntax highlighting — `display`/`group`/etc. should render as keywords, not variable names; (2) deterministic parsing — once tokenized, the parser doesn't have to fall back to the generic identifier path, which reduces ambiguity in complex define statements.

---

## Testing

### New corpus: `test/corpus/proc_report.txt`

Comprehensive cases:
- Basic column + define
- Column with parenthesized groups and quoted headings
- Define with each usage keyword: `display`, `group`, `analysis`, `across`, `order`, `computed`
- Define with `style(...)=[...]` option groups
- Compute block with a `line` statement
- Compute block with `call define(...)`
- BREAK before/after with options (summarize, page, suppress)
- RBREAK before/after with options

### `%include` cases

Add to `test/corpus/macro_language.txt` (it already holds global-statement-adjacent macro cases) or a new `test/corpus/global_statements.txt`. Cases:
- `%include "path/file.sas";`
- `%include "&macrovar/file.sas";` (the screenshot case)
- `%include fileref;`
- `%include "file.sas" /source2;`
- `%inc "file.sas";` (abbreviation — if B's regex change supports it)

### Acceptance gate

`npx tree-sitter test` must pass with **zero failures** and no new ERROR nodes on the reproduction cases from `/tmp/inc.sas` and the PROC REPORT snippet.

---

## Rebuild & rollout

1. `cd D:/Work/tree-sitter-sas && npx tree-sitter generate && npx tree-sitter test`
2. `npx tree-sitter build --wasm`
3. `cp tree-sitter-sas.wasm D:/Work/MIC/lsp-server/grammars/tree-sitter-sas.wasm`
4. Commit grammar changes in the `tree-sitter-sas` repo.
5. The MIC repo's `extension.toml` grammar pin already points at the last push; a new commit will require pushing and re-pinning — **defer the pin bump until changes are verified**, to avoid breaking the working dev extension.

---

## Out of scope

- Tightening `line` statement pointer/format syntax beyond identifiers/numbers/strings.
- Other PROC REPORT-adjacent statements (`where`, `by`, `weight`) — these already parse via shared rules.
- LSP-server-side features (completion items for REPORT keywords, signature help for COMPUTE). The grammar change unblocks these but they're separate work.
- Updating the MIC `extension.toml` grammar commit pin (deferred per rollout step 5).
