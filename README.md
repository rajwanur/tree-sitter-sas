# tree-sitter-sas

SAS grammar for [tree-sitter](https://tree-sitter.github.io/).

## Status

Work in progress. The grammar covers a significant subset of the SAS language.

## What's Supported

- **Base SAS:** DATA steps, PROC steps, global statements, data types, formats/informats
- **SAS Macro Language:** `%MACRO`/`%MEND`, `%IF`/`%THEN`/`%ELSE`, `%DO`, `%LET`, `%PUT`, macro variable resolution
- **PROC Statements:** 20+ procedures including PROC SQL, PROC SORT, PROC PRINT, PROC MEANS, PROC FREQ, and more
- **Expressions:** Arithmetic, logical, comparison operators, functions
- **Comments:** Both `/* block */` and `* statement;` style comments
- **Strings:** Quoted strings with escape sequences, macro variable references

## Build Instructions

### Prerequisites

- [tree-sitter CLI](https://tree-sitter.github.io/tree-sitter/creating-parsers#installation) (`npm install -g tree-sitter-cli`)

### Generate Parser

```bash
tree-sitter generate
tree-sitter test
```

### Node.js

```bash
npm install
node-gyp rebuild
```

### Rust

```bash
cargo build
```

## File Types

- `*.sas`

## License

Apache-2.0
